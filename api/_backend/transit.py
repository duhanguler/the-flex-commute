from __future__ import annotations

import heapq
import json
import math
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

from .models import (
    CityId,
    CommuteRoute,
    CostBreakdown,
    DestinationInput,
    IsochroneBand,
    IsochroneCatchment,
    RankRequest,
    RankResponse,
    RankSummary,
    RankedListing,
    TransitLeg,
)

DATA_DIR = Path(__file__).resolve().parent / "data"
WALK_SPEED_M_PER_MIN = 78.0  # ~4.68 km/h brisk urban walking speed
STREET_DETOUR_FACTOR = 1.26  # Realistic street-grid detour over haversine distance
MAX_ACCESS_WALK_KM = 1.65


@lru_cache(maxsize=1)
def load_networks() -> dict[str, Any]:
    with (DATA_DIR / "transit_networks.json").open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_destinations() -> dict[str, list[dict[str, Any]]]:
    with (DATA_DIR / "destinations.json").open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_listings() -> list[dict[str, Any]]:
    with (DATA_DIR / "listings.json").open("r", encoding="utf-8") as f:
        return json.load(f)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def walk_stats(lat1: float, lng1: float, lat2: float, lng2: float) -> tuple[float, int]:
    dist_m = int(round(haversine_m(lat1, lng1, lat2, lng2) * STREET_DETOUR_FACTOR))
    minutes = max(1.0, dist_m / WALK_SPEED_M_PER_MIN)
    return minutes, dist_m


class CityTransitGraph:
    """Line-aware multi-modal transit graph for Dijkstra door-to-door routing & isochrones."""

    def __init__(self, city_data: dict[str, Any]) -> None:
        self.city_data = city_data
        self.stations: dict[str, dict[str, Any]] = city_data["stations"]
        self.lines: dict[str, dict[str, Any]] = city_data["lines"]
        # station_id -> set of line_ids serving this station
        self.station_lines: dict[str, set[str]] = {sid: set() for sid in self.stations}
        # (station_id, line_id) -> list of (next_station_id, next_line_id, run_min)
        self.line_edges: dict[tuple[str, str], list[tuple[str, str, float]]] = {}
        # station_id -> list of (other_station_id, walk_min)
        self.walk_interchanges: dict[str, list[tuple[str, float]]] = {sid: [] for sid in self.stations}

        for seg in city_data["segments"]:
            line_id = seg["line"]
            stops = seg["stops"]
            times = seg["times"]
            for i in range(len(stops) - 1):
                u, v, t = stops[i], stops[i + 1], float(times[i])
                self.station_lines[u].add(line_id)
                self.station_lines[v].add(line_id)
                self.line_edges.setdefault((u, line_id), []).append((v, line_id, t))
                self.line_edges.setdefault((v, line_id), []).append((u, line_id, t))

        for inter in city_data.get("interchanges", []):
            u, v, w = inter["from"], inter["to"], float(inter["walkMin"])
            self.walk_interchanges[u].append((v, w))
            self.walk_interchanges[v].append((u, w))

    def nearest_stations(self, lat: float, lng: float, limit: int = 4) -> list[tuple[str, float, int]]:
        scored: list[tuple[float, str, int]] = []
        for sid, st in self.stations.items():
            w_min, dist_m = walk_stats(lat, lng, st["lat"], st["lng"])
            scored.append((w_min, sid, dist_m))
        scored.sort(key=lambda x: x[0])
        within = [(sid, w_min, dist_m) for w_min, sid, dist_m in scored if dist_m <= MAX_ACCESS_WALK_KM * 1000]
        if not within:
            within = [(sid, w_min, dist_m) for w_min, sid, dist_m in scored[:2]]
        return within[:limit]

    def _headway_wait(self, line_id: str, time_window: str) -> float:
        line = self.lines[line_id]
        hw = float(line["peakHeadwayMin"] if time_window == "peak" else line["offPeakHeadwayMin"])
        return hw * 0.5

    def route(
        self,
        origin_lat: float,
        origin_lng: float,
        origin_label: str,
        dest: DestinationInput,
        time_window: str = "peak",
    ) -> CommuteRoute:
        direct_walk_min, direct_walk_m = walk_stats(origin_lat, origin_lng, dest.lat, dest.lng)

        # Peak rush hour (08:30): frequent trains, but platform queues, dwell congestion & busy interchanges
        # Off-Peak (11:00): slightly longer wait on outer lines, brisk uncongested running & interchanges
        gate_entry = 2.4 if time_window == "peak" else 1.0
        transfer_walk = 4.2 if time_window == "peak" else 2.0
        transfer_friction = 0.6  # tie-breaker favoring direct lines when times are equal
        run_multiplier = 1.15 if time_window == "peak" else 0.96

        access = self.nearest_stations(origin_lat, origin_lng, limit=4)
        egress = self.nearest_stations(dest.lat, dest.lng, limit=4)
        egress_map = {sid: (w_min, dist_m) for sid, w_min, dist_m in egress}

        # State: (station_id, line_id_or_None)
        # Priority queue items: (cost, exact_time, transfers, state)
        pq: list[tuple[float, float, int, tuple[str, str | None]]] = []
        best_cost: dict[tuple[str, str | None], float] = {}
        parent: dict[tuple[str, str | None], tuple[tuple[str, str | None] | None, str, float, int]] = {}

        for sid, w_min, dist_m in access:
            st = (sid, None)
            best_cost[st] = w_min
            parent[st] = (None, "access_walk", w_min, dist_m)
            heapq.heappush(pq, (w_min, w_min, 0, st))

        best_goal_cost = direct_walk_min
        best_goal_exact = direct_walk_min
        best_goal_state: tuple[str, str | None] | None = None
        best_goal_egress: tuple[str, float, int] | None = None

        while pq:
            cost, exact, transfers, state = heapq.heappop(pq)
            if cost > best_cost.get(state, float("inf")) + 1e-9:
                continue
            if cost >= best_goal_cost:
                break

            sid, cur_line = state

            # Check if we can exit here and walk to destination
            if sid in egress_map and cur_line is not None:
                e_walk, e_dist = egress_map[sid]
                total_cost = cost + e_walk
                total_exact = exact + e_walk
                if total_cost < best_goal_cost:
                    best_goal_cost = total_cost
                    best_goal_exact = total_exact
                    best_goal_state = state
                    best_goal_egress = (sid, e_walk, e_dist)

            if cur_line is None:
                # Board any line serving this station
                for line_id in self.station_lines[sid]:
                    wait = self._headway_wait(line_id, time_window) + gate_entry
                    nxt = (sid, line_id)
                    n_cost = cost + wait
                    n_exact = exact + wait
                    if n_cost < best_cost.get(nxt, float("inf")):
                        best_cost[nxt] = n_cost
                        parent[nxt] = (state, "board", wait, 0)
                        heapq.heappush(pq, (n_cost, n_exact, transfers, nxt))
            else:
                # 1. Ride along current line
                for n_sid, n_line, run_t in self.line_edges.get((sid, cur_line), []):
                    dt = run_t * run_multiplier
                    nxt = (n_sid, n_line)
                    n_cost = cost + dt
                    n_exact = exact + dt
                    if n_cost < best_cost.get(nxt, float("inf")):
                        best_cost[nxt] = n_cost
                        parent[nxt] = (state, "ride", dt, 0)
                        heapq.heappush(pq, (n_cost, n_exact, transfers, nxt))

                # 2. Transfer to another line at the same station
                if transfers < 2:
                    for other_line in self.station_lines[sid]:
                        if other_line == cur_line:
                            continue
                        wait = self._headway_wait(other_line, time_window) + transfer_walk
                        nxt = (sid, other_line)
                        n_cost = cost + wait + transfer_friction
                        n_exact = exact + wait
                        if n_cost < best_cost.get(nxt, float("inf")):
                            best_cost[nxt] = n_cost
                            parent[nxt] = (state, "transfer", wait, 0)
                            heapq.heappush(pq, (n_cost, n_exact, transfers + 1, nxt))

                # 3. Walking interchange to nearby connected station
                if transfers < 2:
                    for other_sid, iw_min in self.walk_interchanges.get(sid, []):
                        for other_line in self.station_lines[other_sid]:
                            if other_line == cur_line:
                                continue
                            wait = iw_min + self._headway_wait(other_line, time_window) + 1.0
                            nxt = (other_sid, other_line)
                            n_cost = cost + wait + transfer_friction
                            n_exact = exact + wait
                            if n_cost < best_cost.get(nxt, float("inf")):
                                best_cost[nxt] = n_cost
                                parent[nxt] = (state, "walk_transfer", wait, int(iw_min * WALK_SPEED_M_PER_MIN))
                                heapq.heappush(pq, (n_cost, n_exact, transfers + 1, nxt))

        # Direct walk wins!
        if best_goal_state is None or best_goal_egress is None:
            walk_leg = TransitLeg(
                kind="walk",
                durationMin=round(direct_walk_min, 1),
                distanceMeters=direct_walk_m,
                fromName=origin_label,
                toName=dest.name,
                coordinates=[[origin_lat, origin_lng], [dest.lat, dest.lng]],
            )
            return CommuteRoute(
                destinationId=dest.id,
                destinationName=dest.name,
                totalMin=max(1, int(round(direct_walk_min))),
                exactMin=round(direct_walk_min, 1),
                walkMin=max(1, int(round(direct_walk_min))),
                transitMin=0,
                waitAndTransferMin=0,
                transfers=0,
                maxZoneCrossed=1,
                isDirectWalk=True,
                summaryLines=[],
                legs=[walk_leg],
            )

        # Reconstruct path
        chain: list[tuple[tuple[str, str | None], str, float, int]] = []
        curr: tuple[str, str | None] | None = best_goal_state
        while curr is not None:
            prev, action, dt, dist_m = parent[curr]
            chain.append((curr, action, dt, dist_m))
            curr = prev
        chain.reverse()

        legs: list[TransitLeg] = []
        walk_total = 0.0
        transit_total = 0.0
        wait_total = 0.0
        transfers_count = 0
        max_zone = 1
        summary_lines: list[dict[str, str]] = []

        # Access walk
        first_state, _, access_min, access_dist = chain[0]
        first_sid = first_state[0]
        first_st = self.stations[first_sid]
        max_zone = max(max_zone, int(first_st["zone"]))
        walk_total += access_min
        legs.append(
            TransitLeg(
                kind="walk",
                durationMin=round(access_min, 1),
                distanceMeters=access_dist,
                fromName=origin_label,
                toName=first_st["name"],
                coordinates=[[origin_lat, origin_lng], [first_st["lat"], first_st["lng"]]],
            )
        )

        # Collapse ride steps per transit line
        i = 1
        while i < len(chain):
            st_node, action, dt, dist_m = chain[i]
            sid, line_id = st_node
            if action == "board":
                wait_total += dt
                i += 1
                continue
            if action in ("transfer", "walk_transfer"):
                transfers_count += 1
                wait_total += dt
                prev_sid = chain[i - 1][0][0]
                prev_st = self.stations[prev_sid]
                cur_st = self.stations[sid]
                legs.append(
                    TransitLeg(
                        kind="transfer",
                        durationMin=round(dt, 1),
                        distanceMeters=dist_m if dist_m > 0 else 140,
                        fromName=prev_st["name"],
                        toName=cur_st["name"],
                        coordinates=[[prev_st["lat"], prev_st["lng"]], [cur_st["lat"], cur_st["lng"]]],
                    )
                )
                i += 1
                continue
            if action == "ride" and line_id is not None:
                start_sid = chain[i - 1][0][0]
                stop_ids = [start_sid, sid]
                seg_dur = dt
                j = i + 1
                while j < len(chain) and chain[j][1] == "ride" and chain[j][0][1] == line_id:
                    stop_ids.append(chain[j][0][0])
                    seg_dur += chain[j][2]
                    j += 1

                line_meta = self.lines[line_id]
                transit_total += seg_dur
                coords = []
                names = []
                for s_id in stop_ids:
                    s_obj = self.stations[s_id]
                    max_zone = max(max_zone, int(s_obj["zone"]))
                    coords.append([s_obj["lat"], s_obj["lng"]])
                    names.append(s_obj["name"])

                summary_lines.append(
                    {
                        "id": line_id,
                        "name": line_meta["name"],
                        "shortName": line_meta["shortName"],
                        "color": line_meta["color"],
                        "textColor": line_meta["textColor"],
                        "stops": str(len(stop_ids) - 1),
                    }
                )
                legs.append(
                    TransitLeg(
                        kind="transit",
                        durationMin=round(seg_dur, 1),
                        lineId=line_id,
                        lineName=line_meta["name"],
                        lineShortName=line_meta["shortName"],
                        lineColor=line_meta["color"],
                        lineTextColor=line_meta["textColor"],
                        mode=line_meta["mode"],
                        fromName=names[0],
                        toName=names[-1],
                        stopsCount=len(stop_ids) - 1,
                        stopNames=names,
                        coordinates=coords,
                    )
                )
                i = j
                continue
            i += 1

        # Egress walk
        egress_sid, egress_min, egress_dist = best_goal_egress
        egress_st = self.stations[egress_sid]
        max_zone = max(max_zone, int(egress_st["zone"]))
        walk_total += egress_min
        legs.append(
            TransitLeg(
                kind="walk",
                durationMin=round(egress_min, 1),
                distanceMeters=egress_dist,
                fromName=egress_st["name"],
                toName=dest.name,
                coordinates=[[egress_st["lat"], egress_st["lng"]], [dest.lat, dest.lng]],
            )
        )

        # If a transit path somehow had 0 transit legs (degenerate), fallback to direct walk
        if not summary_lines:
            return CommuteRoute(
                destinationId=dest.id,
                destinationName=dest.name,
                totalMin=max(1, int(round(direct_walk_min))),
                exactMin=round(direct_walk_min, 1),
                walkMin=max(1, int(round(direct_walk_min))),
                transitMin=0,
                waitAndTransferMin=0,
                transfers=0,
                maxZoneCrossed=1,
                isDirectWalk=True,
                summaryLines=[],
                legs=[
                    TransitLeg(
                        kind="walk",
                        durationMin=round(direct_walk_min, 1),
                        distanceMeters=direct_walk_m,
                        fromName=origin_label,
                        toName=dest.name,
                        coordinates=[[origin_lat, origin_lng], [dest.lat, dest.lng]],
                    )
                ],
            )

        exact_total = round(best_goal_exact, 1)
        total_min = max(1, int(round(exact_total)))
        walk_m = max(1, int(round(walk_total)))
        transit_m = max(1, int(round(transit_total)))
        wait_m = max(0, total_min - walk_m - transit_m)
        return CommuteRoute(
            destinationId=dest.id,
            destinationName=dest.name,
            totalMin=total_min,
            exactMin=exact_total,
            walkMin=walk_m,
            transitMin=transit_m,
            waitAndTransferMin=wait_m,
            transfers=transfers_count,
            maxZoneCrossed=max_zone,
            isDirectWalk=False,
            summaryLines=summary_lines,
            legs=legs,
        )

    def compute_station_times_from_destination(
        self, dest: DestinationInput, time_window: str = "peak"
    ) -> dict[str, float]:
        """Reverse Dijkstra from a destination to compute minimum travel time to every station."""
        gate_entry = 2.4 if time_window == "peak" else 1.0
        transfer_walk = 4.2 if time_window == "peak" else 2.0
        run_multiplier = 1.15 if time_window == "peak" else 0.96

        egress = self.nearest_stations(dest.lat, dest.lng, limit=4)
        pq: list[tuple[float, tuple[str, str | None]]] = []
        best: dict[tuple[str, str | None], float] = {}

        for sid, w_min, _ in egress:
            st = (sid, None)
            best[st] = w_min
            heapq.heappush(pq, (w_min, st))

        station_best: dict[str, float] = {}
        while pq:
            t, state = heapq.heappop(pq)
            if t > best.get(state, float("inf")) + 1e-9:
                continue
            if t > 50.0:
                break
            sid, cur_line = state

            if cur_line is None:
                station_best[sid] = min(station_best.get(sid, float("inf")), t)
                for line_id in self.station_lines[sid]:
                    wait = self._headway_wait(line_id, time_window) + gate_entry
                    nxt = (sid, line_id)
                    if t + wait < best.get(nxt, float("inf")):
                        best[nxt] = t + wait
                        heapq.heappush(pq, (t + wait, nxt))
            else:
                station_best[sid] = min(station_best.get(sid, float("inf")), t)
                for n_sid, n_line, run_t in self.line_edges.get((sid, cur_line), []):
                    nt = t + run_t * run_multiplier
                    nxt = (n_sid, n_line)
                    if nt < best.get(nxt, float("inf")):
                        best[nxt] = nt
                        heapq.heappush(pq, (nt, nxt))
                for other_line in self.station_lines[sid]:
                    if other_line == cur_line:
                        continue
                    nt = t + self._headway_wait(other_line, time_window) + transfer_walk
                    nxt = (sid, other_line)
                    if nt < best.get(nxt, float("inf")):
                        best[nxt] = nt
                        heapq.heappush(pq, (nt, nxt))
                for other_sid, iw_min in self.walk_interchanges.get(sid, []):
                    for other_line in self.station_lines[other_sid]:
                        if other_line == cur_line:
                            continue
                        nt = t + iw_min + self._headway_wait(other_line, time_window) + 1.0
                        nxt = (other_sid, other_line)
                        if nt < best.get(nxt, float("inf")):
                            best[nxt] = nt
                            heapq.heappush(pq, (nt, nxt))

        return station_best

    def compute_isochrones(
        self, destinations: list[DestinationInput], time_window: str = "peak"
    ) -> list[IsochroneBand]:
        """Compute true transit-graph 15 / 30 / 45 min reachability zones around destination(s)."""
        per_dest_times = [self.compute_station_times_from_destination(d, time_window) for d in destinations]

        bands: list[IsochroneBand] = []
        for threshold in (15, 30, 45):
            catchments: list[IsochroneCatchment] = []
            # Direct walking catchment around primary destination (or both if single)
            if len(destinations) == 1:
                d = destinations[0]
                walk_budget = min(float(threshold), 18.0)
                radius = int(round((walk_budget * WALK_SPEED_M_PER_MIN) / STREET_DETOUR_FACTOR))
                catchments.append(
                    IsochroneCatchment(
                        stationId=f"dest-{d.id}",
                        stationName=d.name,
                        lat=d.lat,
                        lng=d.lng,
                        arriveMin=0.0,
                        radiusMeters=radius,
                    )
                )

            reachable_stations = 0
            for sid, st in self.stations.items():
                times = [m.get(sid, float("inf")) for m in per_dest_times]
                # For 2 destinations, require both to be reachable within threshold (intersection!)
                effective_t = max(times)
                if effective_t < threshold - 1.0:
                    reachable_stations += 1
                    rem_walk_min = min(threshold - effective_t, 12.0)
                    radius = int(round((rem_walk_min * WALK_SPEED_M_PER_MIN) / STREET_DETOUR_FACTOR))
                    if radius >= 180:
                        catchments.append(
                            IsochroneCatchment(
                                stationId=sid,
                                stationName=st["name"],
                                lat=st["lat"],
                                lng=st["lng"],
                                arriveMin=round(effective_t, 1),
                                radiusMeters=radius,
                            )
                        )
            bands.append(
                IsochroneBand(
                    minutes=threshold,
                    reachableStationsCount=reachable_stations,
                    catchments=catchments,
                )
            )
        return bands


@lru_cache(maxsize=4)
def get_city_graph(city: CityId) -> CityTransitGraph:
    networks = load_networks()
    return CityTransitGraph(networks[city])


def rank_listings(req: RankRequest) -> RankResponse:
    t0 = time.perf_counter()
    networks = load_networks()
    city_meta = networks[req.city]
    graph = get_city_graph(req.city)
    city_listings = [l for l in load_listings() if l["city"] == req.city]

    pass_table: dict[str, float] = city_meta["monthlyPassByZone"]
    pass_label: str = city_meta["passLabel"]
    city_median: int = int(city_meta["cityMedianCommuteMin"])

    computed: list[dict[str, Any]] = []

    for item in city_listings:
        routes: list[CommuteRoute] = [
            graph.route(
                origin_lat=item["lat"],
                origin_lng=item["lng"],
                origin_label=item["neighborhood"],
                dest=dest,
                time_window=req.timeWindow,
            )
            for dest in req.destinations
        ]

        if len(routes) == 1:
            r0 = routes[0]
            primary_min = r0.totalMin
            commute_score = r0.exactMin
            fairness_delta = None
            weekly_trips_min = r0.exactMin * 2.0 * req.destinations[0].daysPerWeek
            total_transfers = r0.transfers
            max_zone = max(int(item["fareZone"]), r0.maxZoneCrossed)
        else:
            r0, r1 = routes[0], routes[1]
            fairness_delta = abs(r0.totalMin - r1.totalMin)
            total_transfers = max(r0.transfers, r1.transfers)
            max_zone = max(int(item["fareZone"]), r0.maxZoneCrossed, r1.maxZoneCrossed)
            if req.strategy == "fairness":
                primary_min = max(r0.totalMin, r1.totalMin)
                commute_score = max(r0.exactMin, r1.exactMin) + 0.15 * abs(r0.exactMin - r1.exactMin)
                weekly_trips_min = ((r0.exactMin + r1.exactMin) / 2.0) * 10.0
            elif req.strategy == "balanced":
                primary_min = int(round((r0.totalMin + r1.totalMin) / 2.0))
                commute_score = (r0.exactMin + r1.exactMin) / 2.0
                weekly_trips_min = ((r0.exactMin + r1.exactMin) / 2.0) * 10.0
            else:
                # Hybrid weekly weighted commute
                d0, d1 = req.destinations[0].daysPerWeek, req.destinations[1].daysPerWeek
                total_days = max(1, d0 + d1)
                weighted_avg = (r0.exactMin * d0 + r1.exactMin * d1) / total_days
                primary_min = int(round(weighted_avg))
                commute_score = weighted_avg
                weekly_trips_min = (r0.exactMin * d0 + r1.exactMin * d1) * 2.0

        weekly_hours = round(weekly_trips_min / 60.0, 1)
        monthly_commute_hours = round((weekly_trips_min * 4.33) / 60.0, 1)
        # If every route is direct walk, no transit pass required!
        if all(r.isDirectWalk for r in routes):
            monthly_pass = 0.0
        else:
            zone_key = str(min(max(max_zone, 1), 4))
            monthly_pass = float(pass_table.get(zone_key, pass_table["2"]))

        true_cash = round(item["monthlyRentLocal"] + monthly_pass, 1)
        median_monthly_hours = round((city_median * 10.0 * 4.33) / 60.0, 1)
        hours_saved = round(median_monthly_hours - monthly_commute_hours, 1)
        effective_cost = round(true_cash + monthly_commute_hours * req.hourlyTimeValueLocal, 1)

        # Check filters
        f = req.filters
        matches = True
        if f.maxCommuteMin is not None and primary_min > f.maxCommuteMin:
            matches = False
        if f.maxTransfers is not None and total_transfers > f.maxTransfers:
            matches = False
        if f.bedrooms is not None and int(item["bedrooms"]) != f.bedrooms:
            matches = False
        if f.maxRentLocal is not None and int(item["monthlyRentLocal"]) > f.maxRentLocal:
            matches = False

        computed.append(
            {
                "item": item,
                "routes": routes,
                "primaryMin": primary_min,
                "commuteScore": commute_score,
                "fairnessDelta": fairness_delta,
                "weeklyHours": weekly_hours,
                "monthlyCommuteHours": monthly_commute_hours,
                "monthlyPass": monthly_pass,
                "trueCash": true_cash,
                "hoursSaved": hours_saved,
                "effectiveCost": effective_cost,
                "totalTransfers": total_transfers,
                "matches": matches,
            }
        )

    # Compute Pareto frontier across all city listings (minimizing both commuteScore & trueCash)
    for row in computed:
        dominated = False
        for other in computed:
            if other["item"]["id"] == row["item"]["id"]:
                continue
            if (
                other["primaryMin"] <= row["primaryMin"]
                and other["trueCash"] <= row["trueCash"]
                and (other["primaryMin"] < row["primaryMin"] or other["trueCash"] < row["trueCash"])
            ):
                dominated = True
                break
        row["isPareto"] = not dominated

    # Normalize 0-100 value score based on effectiveCost relative to city range
    eff_costs = [r["effectiveCost"] for r in computed]
    min_eff, max_eff = min(eff_costs), max(eff_costs)
    span = max(1.0, max_eff - min_eff)
    for row in computed:
        norm = 1.0 - (row["effectiveCost"] - min_eff) / span
        row["valueScore"] = int(round(58 + norm * 40))

    # Sort listings
    def sort_key(row: dict[str, Any]) -> tuple[Any, ...]:
        # Always keep matching listings first when returning full set
        m_flag = 0 if row["matches"] else 1
        if req.sortBy == "value":
            return (m_flag, row["effectiveCost"], row["commuteScore"])
        if req.sortBy == "true_cost":
            return (m_flag, row["trueCash"], row["commuteScore"])
        if req.sortBy == "rent":
            return (m_flag, row["item"]["monthlyRentLocal"], row["commuteScore"])
        if req.sortBy == "transfers":
            return (m_flag, row["totalTransfers"], row["commuteScore"])
        # default: fastest commute
        return (m_flag, row["commuteScore"], row["totalTransfers"], row["trueCash"])

    computed.sort(key=sort_key)

    ranked_listings: list[RankedListing] = []
    matching_times: list[int] = []
    for idx, row in enumerate(computed, start=1):
        item = row["item"]
        if row["matches"]:
            matching_times.append(row["primaryMin"])
        ranked_listings.append(
            RankedListing(
                **item,
                rank=idx,
                primaryCommuteMin=row["primaryMin"],
                commuteScoreMin=round(row["commuteScore"], 1),
                fairnessDeltaMin=row["fairnessDelta"],
                weeklyCommuteHours=row["weeklyHours"],
                totalTransfers=row["totalTransfers"],
                routes=row["routes"],
                cost=CostBreakdown(
                    baseCurrency=item["baseCurrency"],
                    monthlyRentLocal=item["monthlyRentLocal"],
                    monthlyPassLocal=row["monthlyPass"],
                    passLabel="Walk to work (No transit pass needed)" if row["monthlyPass"] == 0 else pass_label,
                    trueMonthlyCashLocal=row["trueCash"],
                    monthlyCommuteHours=row["monthlyCommuteHours"],
                    hoursSavedVsMedian=row["hoursSaved"],
                    effectiveMonthlyCostLocal=row["effectiveCost"],
                    valueScore=row["valueScore"],
                ),
                isParetoOptimal=row["isPareto"],
                matchesFilters=row["matches"],
            )
        )

    isochrones = graph.compute_isochrones(req.destinations, req.timeWindow)
    matching_sorted = sorted(matching_times)
    fastest_min = matching_sorted[0] if matching_sorted else None
    median_min = matching_sorted[len(matching_sorted) // 2] if matching_sorted else None
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

    return RankResponse(
        city=req.city,
        timeWindow=req.timeWindow,
        strategy=req.strategy,
        sortBy=req.sortBy,
        summary=RankSummary(
            totalListings=len(ranked_listings),
            matchingListings=len(matching_times),
            fastestMin=fastest_min,
            medianMin=median_min,
            cityMedianMin=city_median,
            computeMs=elapsed_ms,
        ),
        isochrones=isochrones,
        listings=ranked_listings,
    )
