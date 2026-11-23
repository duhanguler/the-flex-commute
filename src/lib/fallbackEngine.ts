import networksRaw from '../../api/_backend/data/transit_networks.json';
import destinationsRaw from '../../api/_backend/data/destinations.json';
import listingsRaw from '../../api/_backend/data/listings.json';
import type {
  CityBootstrap,
  CityId,
  CommuteRoute,
  CuratedDestination,
  DestinationInput,
  IsochroneBand,
  IsochroneCatchment,
  NetworkPolyline,
  RankRequest,
  RankResponse,
  RankedListing,
  SummaryLineBadge,
  TransitLeg,
} from './types';

interface StationMeta {
  name: string;
  lat: number;
  lng: number;
  zone: number;
}

interface LineMeta {
  id: string;
  name: string;
  shortName: string;
  mode: string;
  color: string;
  textColor: string;
  peakHeadwayMin: number;
  offPeakHeadwayMin: number;
}

interface CityNetworkData {
  name: string;
  country: string;
  baseCurrency: 'GBP' | 'EUR';
  center: [number, number];
  defaultZoom: number;
  monthlyPassByZone: Record<string, number>;
  passLabel: string;
  cityMedianCommuteMin: number;
  lines: Record<string, LineMeta>;
  stations: Record<string, StationMeta>;
  segments: { line: string; stops: string[]; times: number[] }[];
  interchanges: { from: string; to: string; walkMin: number }[];
}

const NETWORKS = networksRaw as unknown as Record<CityId, CityNetworkData>;
const DESTINATIONS = destinationsRaw as unknown as Record<CityId, CuratedDestination[]>;
const LISTINGS = listingsRaw as unknown as Omit<
  RankedListing,
  | 'rank'
  | 'primaryCommuteMin'
  | 'commuteScoreMin'
  | 'fairnessDeltaMin'
  | 'weeklyCommuteHours'
  | 'totalTransfers'
  | 'routes'
  | 'cost'
  | 'isParetoOptimal'
  | 'matchesFilters'
>[];

const WALK_SPEED = 78.0;
const STREET_DETOUR = 1.26;
const MAX_ACCESS_M = 1650;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dPhi = toRad(lat2 - lat1);
  const dLam = toRad(lng2 - lng1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLam / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function walkStats(lat1: number, lng1: number, lat2: number, lng2: number): [number, number] {
  const distM = Math.round(haversineM(lat1, lng1, lat2, lng2) * STREET_DETOUR);
  return [Math.max(1.0, distM / WALK_SPEED), distM];
}

class LocalCityGraph {
  net: CityNetworkData;
  stationLines = new Map<string, Set<string>>();
  lineEdges = new Map<string, { nextSid: string; nextLine: string; t: number }[]>();
  walkInterchanges = new Map<string, { otherSid: string; walkMin: number }[]>();

  constructor(net: CityNetworkData) {
    this.net = net;
    for (const sid of Object.keys(net.stations)) {
      this.stationLines.set(sid, new Set());
      this.walkInterchanges.set(sid, []);
    }
    for (const seg of net.segments) {
      for (let i = 0; i < seg.stops.length - 1; i++) {
        const u = seg.stops[i];
        const v = seg.stops[i + 1];
        const t = seg.times[i];
        this.stationLines.get(u)?.add(seg.line);
        this.stationLines.get(v)?.add(seg.line);
        const ku = `${u}|${seg.line}`;
        const kv = `${v}|${seg.line}`;
        if (!this.lineEdges.has(ku)) this.lineEdges.set(ku, []);
        if (!this.lineEdges.has(kv)) this.lineEdges.set(kv, []);
        this.lineEdges.get(ku)!.push({ nextSid: v, nextLine: seg.line, t });
        this.lineEdges.get(kv)!.push({ nextSid: u, nextLine: seg.line, t });
      }
    }
    for (const inter of net.interchanges) {
      this.walkInterchanges.get(inter.from)?.push({ otherSid: inter.to, walkMin: inter.walkMin });
      this.walkInterchanges.get(inter.to)?.push({ otherSid: inter.from, walkMin: inter.walkMin });
    }
  }

  nearestStations(lat: number, lng: number, limit = 4) {
    const scored = Object.entries(this.net.stations).map(([sid, st]) => {
      const [wMin, distM] = walkStats(lat, lng, st.lat, st.lng);
      return { sid, wMin, distM };
    });
    scored.sort((a, b) => a.wMin - b.wMin);
    const within = scored.filter((s) => s.distM <= MAX_ACCESS_M);
    return (within.length > 0 ? within : scored.slice(0, 2)).slice(0, limit);
  }

  headwayWait(lineId: string, timeWindow: 'peak' | 'off_peak') {
    const line = this.net.lines[lineId];
    const hw = timeWindow === 'peak' ? line.peakHeadwayMin : line.offPeakHeadwayMin;
    return hw * 0.5;
  }

  route(
    originLat: number,
    originLng: number,
    originLabel: string,
    dest: DestinationInput,
    timeWindow: 'peak' | 'off_peak',
  ): CommuteRoute {
    const [directWalkMin, directWalkM] = walkStats(originLat, originLng, dest.lat, dest.lng);
    const gateEntry = timeWindow === 'peak' ? 2.4 : 1.0;
    const transferWalk = timeWindow === 'peak' ? 4.2 : 2.0;
    const transferFriction = 0.6;
    const runMult = timeWindow === 'peak' ? 1.15 : 0.96;

    const access = this.nearestStations(originLat, originLng, 4);
    const egress = this.nearestStations(dest.lat, dest.lng, 4);
    const egressMap = new Map(egress.map((e) => [e.sid, e]));

    interface NodeItem {
      cost: number;
      exact: number;
      transfers: number;
      key: string;
      sid: string;
      line: string | null;
    }

    const pq: NodeItem[] = [];
    const bestCost = new Map<string, number>();
    const parent = new Map<
      string,
      { prevKey: string | null; action: string; dt: number; distM: number; sid: string; line: string | null }
    >();

    const push = (item: NodeItem) => {
      pq.push(item);
      let idx = pq.length - 1;
      while (idx > 0) {
        const p = (idx - 1) >> 1;
        if (pq[p].cost <= pq[idx].cost) break;
        [pq[p], pq[idx]] = [pq[idx], pq[p]];
        idx = p;
      }
    };

    const pop = (): NodeItem | undefined => {
      if (pq.length === 0) return undefined;
      const top = pq[0];
      const last = pq.pop()!;
      if (pq.length > 0) {
        pq[0] = last;
        let idx = 0;
        while (true) {
          const l = 2 * idx + 1;
          const r = 2 * idx + 2;
          let smallest = idx;
          if (l < pq.length && pq[l].cost < pq[smallest].cost) smallest = l;
          if (r < pq.length && pq[r].cost < pq[smallest].cost) smallest = r;
          if (smallest === idx) break;
          [pq[idx], pq[smallest]] = [pq[smallest], pq[idx]];
          idx = smallest;
        }
      }
      return top;
    };

    for (const a of access) {
      const key = `${a.sid}|`;
      bestCost.set(key, a.wMin);
      parent.set(key, { prevKey: null, action: 'access_walk', dt: a.wMin, distM: a.distM, sid: a.sid, line: null });
      push({ cost: a.wMin, exact: a.wMin, transfers: 0, key, sid: a.sid, line: null });
    }

    let bestGoalCost = directWalkMin;
    let bestGoalExact = directWalkMin;
    let bestGoalKey: string | null = null;
    let bestGoalEgress: { sid: string; wMin: number; distM: number } | null = null;

    while (pq.length > 0) {
      const cur = pop()!;
      if (cur.cost > (bestCost.get(cur.key) ?? Infinity) + 1e-9) continue;
      if (cur.cost >= bestGoalCost) break;

      if (cur.line !== null && egressMap.has(cur.sid)) {
        const e = egressMap.get(cur.sid)!;
        const totCost = cur.cost + e.wMin;
        if (totCost < bestGoalCost) {
          bestGoalCost = totCost;
          bestGoalExact = cur.exact + e.wMin;
          bestGoalKey = cur.key;
          bestGoalEgress = e;
        }
      }

      if (cur.line === null) {
        for (const lineId of this.stationLines.get(cur.sid) ?? []) {
          const wait = this.headwayWait(lineId, timeWindow) + gateEntry;
          const nKey = `${cur.sid}|${lineId}`;
          const nCost = cur.cost + wait;
          if (nCost < (bestCost.get(nKey) ?? Infinity)) {
            bestCost.set(nKey, nCost);
            parent.set(nKey, { prevKey: cur.key, action: 'board', dt: wait, distM: 0, sid: cur.sid, line: lineId });
            push({ cost: nCost, exact: cur.exact + wait, transfers: cur.transfers, key: nKey, sid: cur.sid, line: lineId });
          }
        }
      } else {
        for (const edge of this.lineEdges.get(`${cur.sid}|${cur.line}`) ?? []) {
          const dt = edge.t * runMult;
          const nKey = `${edge.nextSid}|${edge.nextLine}`;
          const nCost = cur.cost + dt;
          if (nCost < (bestCost.get(nKey) ?? Infinity)) {
            bestCost.set(nKey, nCost);
            parent.set(nKey, { prevKey: cur.key, action: 'ride', dt, distM: 0, sid: edge.nextSid, line: edge.nextLine });
            push({ cost: nCost, exact: cur.exact + dt, transfers: cur.transfers, key: nKey, sid: edge.nextSid, line: edge.nextLine });
          }
        }
        if (cur.transfers < 2) {
          for (const otherLine of this.stationLines.get(cur.sid) ?? []) {
            if (otherLine === cur.line) continue;
            const wait = this.headwayWait(otherLine, timeWindow) + transferWalk;
            const nKey = `${cur.sid}|${otherLine}`;
            const nCost = cur.cost + wait + transferFriction;
            if (nCost < (bestCost.get(nKey) ?? Infinity)) {
              bestCost.set(nKey, nCost);
              parent.set(nKey, { prevKey: cur.key, action: 'transfer', dt: wait, distM: 0, sid: cur.sid, line: otherLine });
              push({ cost: nCost, exact: cur.exact + wait, transfers: cur.transfers + 1, key: nKey, sid: cur.sid, line: otherLine });
            }
          }
          for (const inter of this.walkInterchanges.get(cur.sid) ?? []) {
            for (const otherLine of this.stationLines.get(inter.otherSid) ?? []) {
              if (otherLine === cur.line) continue;
              const wait = inter.walkMin + this.headwayWait(otherLine, timeWindow) + 1.0;
              const nKey = `${inter.otherSid}|${otherLine}`;
              const nCost = cur.cost + wait + transferFriction;
              if (nCost < (bestCost.get(nKey) ?? Infinity)) {
                bestCost.set(nKey, nCost);
                parent.set(nKey, {
                  prevKey: cur.key,
                  action: 'walk_transfer',
                  dt: wait,
                  distM: Math.round(inter.walkMin * WALK_SPEED),
                  sid: inter.otherSid,
                  line: otherLine,
                });
                push({
                  cost: nCost,
                  exact: cur.exact + wait,
                  transfers: cur.transfers + 1,
                  key: nKey,
                  sid: inter.otherSid,
                  line: otherLine,
                });
              }
            }
          }
        }
      }
    }

    const directWalkRoute = (): CommuteRoute => ({
      destinationId: dest.id,
      destinationName: dest.name,
      totalMin: Math.max(1, Math.round(directWalkMin)),
      exactMin: Number(directWalkMin.toFixed(1)),
      walkMin: Math.max(1, Math.round(directWalkMin)),
      transitMin: 0,
      waitAndTransferMin: 0,
      transfers: 0,
      maxZoneCrossed: 1,
      isDirectWalk: true,
      summaryLines: [],
      legs: [
        {
          kind: 'walk',
          durationMin: Number(directWalkMin.toFixed(1)),
          distanceMeters: directWalkM,
          fromName: originLabel,
          toName: dest.name,
          stopsCount: 0,
          stopNames: [],
          coordinates: [
            [originLat, originLng],
            [dest.lat, dest.lng],
          ],
        },
      ],
    });

    if (!bestGoalKey || !bestGoalEgress) {
      return directWalkRoute();
    }

    const chain: { sid: string; line: string | null; action: string; dt: number; distM: number }[] = [];
    let k: string | null = bestGoalKey;
    while (k) {
      const p: {
        prevKey: string | null;
        action: string;
        dt: number;
        distM: number;
        sid: string;
        line: string | null;
      } | undefined = parent.get(k);
      if (!p) break;
      chain.push({ sid: p.sid, line: p.line, action: p.action, dt: p.dt, distM: p.distM });
      k = p.prevKey;
    }
    chain.reverse();

    const legs: TransitLeg[] = [];
    let walkTotal = 0;
    let transitTotal = 0;
    let waitTotal = 0;
    let transfersCount = 0;
    let maxZone = 1;
    const summaryLines: SummaryLineBadge[] = [];

    const firstSt = this.net.stations[chain[0].sid];
    maxZone = Math.max(maxZone, firstSt.zone);
    walkTotal += chain[0].dt;
    legs.push({
      kind: 'walk',
      durationMin: Number(chain[0].dt.toFixed(1)),
      distanceMeters: chain[0].distM,
      fromName: originLabel,
      toName: firstSt.name,
      stopsCount: 0,
      stopNames: [],
      coordinates: [
        [originLat, originLng],
        [firstSt.lat, firstSt.lng],
      ],
    });

    let i = 1;
    while (i < chain.length) {
      const step = chain[i];
      if (step.action === 'board') {
        waitTotal += step.dt;
        i++;
        continue;
      }
      if (step.action === 'transfer' || step.action === 'walk_transfer') {
        transfersCount++;
        waitTotal += step.dt;
        const prevSt = this.net.stations[chain[i - 1].sid];
        const curSt = this.net.stations[step.sid];
        legs.push({
          kind: 'transfer',
          durationMin: Number(step.dt.toFixed(1)),
          distanceMeters: step.distM > 0 ? step.distM : 140,
          fromName: prevSt.name,
          toName: curSt.name,
          stopsCount: 0,
          stopNames: [],
          coordinates: [
            [prevSt.lat, prevSt.lng],
            [curSt.lat, curSt.lng],
          ],
        });
        i++;
        continue;
      }
      if (step.action === 'ride' && step.line) {
        const lineId = step.line;
        const stopIds = [chain[i - 1].sid, step.sid];
        let dur = step.dt;
        let j = i + 1;
        while (j < chain.length && chain[j].action === 'ride' && chain[j].line === lineId) {
          stopIds.push(chain[j].sid);
          dur += chain[j].dt;
          j++;
        }
        const meta = this.net.lines[lineId];
        transitTotal += dur;
        const coords: [number, number][] = [];
        const names: string[] = [];
        for (const sId of stopIds) {
          const st = this.net.stations[sId];
          maxZone = Math.max(maxZone, st.zone);
          coords.push([st.lat, st.lng]);
          names.push(st.name);
        }
        summaryLines.push({
          id: lineId,
          name: meta.name,
          shortName: meta.shortName,
          color: meta.color,
          textColor: meta.textColor,
          stops: String(stopIds.length - 1),
        });
        legs.push({
          kind: 'transit',
          durationMin: Number(dur.toFixed(1)),
          lineId,
          lineName: meta.name,
          lineShortName: meta.shortName,
          lineColor: meta.color,
          lineTextColor: meta.textColor,
          mode: meta.mode,
          fromName: names[0],
          toName: names[names.length - 1],
          stopsCount: stopIds.length - 1,
          stopNames: names,
          coordinates: coords,
        });
        i = j;
        continue;
      }
      i++;
    }

    const egressSt = this.net.stations[bestGoalEgress.sid];
    maxZone = Math.max(maxZone, egressSt.zone);
    walkTotal += bestGoalEgress.wMin;
    legs.push({
      kind: 'walk',
      durationMin: Number(bestGoalEgress.wMin.toFixed(1)),
      distanceMeters: bestGoalEgress.distM,
      fromName: egressSt.name,
      toName: dest.name,
      stopsCount: 0,
      stopNames: [],
      coordinates: [
        [egressSt.lat, egressSt.lng],
        [dest.lat, dest.lng],
      ],
    });

    if (summaryLines.length === 0) return directWalkRoute();

    const exact = Number(bestGoalExact.toFixed(1));
    const totalMin = Math.max(1, Math.round(exact));
    const walkMin = Math.max(1, Math.round(walkTotal));
    const transitMin = Math.max(1, Math.round(transitTotal));
    const waitAndTransferMin = Math.max(0, totalMin - walkMin - transitMin);
    return {
      destinationId: dest.id,
      destinationName: dest.name,
      totalMin,
      exactMin: exact,
      walkMin,
      transitMin,
      waitAndTransferMin,
      transfers: transfersCount,
      maxZoneCrossed: maxZone,
      isDirectWalk: false,
      summaryLines,
      legs,
    };
  }

  stationTimesFromDest(dest: DestinationInput, timeWindow: 'peak' | 'off_peak'): Map<string, number> {
    const gateEntry = timeWindow === 'peak' ? 2.4 : 1.0;
    const transferWalk = timeWindow === 'peak' ? 4.2 : 2.0;
    const runMult = timeWindow === 'peak' ? 1.15 : 0.96;

    const egress = this.nearestStations(dest.lat, dest.lng, 4);
    const pq: { t: number; sid: string; line: string | null; key: string }[] = [];
    const best = new Map<string, number>();
    const stationBest = new Map<string, number>();

    for (const e of egress) {
      const key = `${e.sid}|`;
      best.set(key, e.wMin);
      pq.push({ t: e.wMin, sid: e.sid, line: null, key });
    }

    while (pq.length > 0) {
      pq.sort((a, b) => a.t - b.t);
      const cur = pq.shift()!;
      if (cur.t > (best.get(cur.key) ?? Infinity) + 1e-9) continue;
      if (cur.t > 50) break;

      stationBest.set(cur.sid, Math.min(stationBest.get(cur.sid) ?? Infinity, cur.t));
      if (cur.line === null) {
        for (const lineId of this.stationLines.get(cur.sid) ?? []) {
          const nt = cur.t + this.headwayWait(lineId, timeWindow) + gateEntry;
          const nKey = `${cur.sid}|${lineId}`;
          if (nt < (best.get(nKey) ?? Infinity)) {
            best.set(nKey, nt);
            pq.push({ t: nt, sid: cur.sid, line: lineId, key: nKey });
          }
        }
      } else {
        for (const edge of this.lineEdges.get(`${cur.sid}|${cur.line}`) ?? []) {
          const nt = cur.t + edge.t * runMult;
          const nKey = `${edge.nextSid}|${edge.nextLine}`;
          if (nt < (best.get(nKey) ?? Infinity)) {
            best.set(nKey, nt);
            pq.push({ t: nt, sid: edge.nextSid, line: edge.nextLine, key: nKey });
          }
        }
        for (const otherLine of this.stationLines.get(cur.sid) ?? []) {
          if (otherLine === cur.line) continue;
          const nt = cur.t + this.headwayWait(otherLine, timeWindow) + transferWalk;
          const nKey = `${cur.sid}|${otherLine}`;
          if (nt < (best.get(nKey) ?? Infinity)) {
            best.set(nKey, nt);
            pq.push({ t: nt, sid: cur.sid, line: otherLine, key: nKey });
          }
        }
        for (const inter of this.walkInterchanges.get(cur.sid) ?? []) {
          for (const otherLine of this.stationLines.get(inter.otherSid) ?? []) {
            if (otherLine === cur.line) continue;
            const nt = cur.t + inter.walkMin + this.headwayWait(otherLine, timeWindow) + 1.0;
            const nKey = `${inter.otherSid}|${otherLine}`;
            if (nt < (best.get(nKey) ?? Infinity)) {
              best.set(nKey, nt);
              pq.push({ t: nt, sid: inter.otherSid, line: otherLine, key: nKey });
            }
          }
        }
      }
    }
    return stationBest;
  }

  computeIsochrones(destinations: DestinationInput[], timeWindow: 'peak' | 'off_peak'): IsochroneBand[] {
    const maps = destinations.map((d) => this.stationTimesFromDest(d, timeWindow));
    return [15, 30, 45].map((threshold) => {
      const catchments: IsochroneCatchment[] = [];
      if (destinations.length === 1) {
        const d = destinations[0];
        const walkBudget = Math.min(threshold, 18);
        catchments.push({
          stationId: `dest-${d.id}`,
          stationName: d.name,
          lat: d.lat,
          lng: d.lng,
          arriveMin: 0,
          radiusMeters: Math.round((walkBudget * WALK_SPEED) / STREET_DETOUR),
        });
      }
      let reachable = 0;
      for (const [sid, st] of Object.entries(this.net.stations)) {
        const effT = Math.max(...maps.map((m) => m.get(sid) ?? Infinity));
        if (effT < threshold - 1) {
          reachable++;
          const remWalk = Math.min(threshold - effT, 12);
          const radius = Math.round((remWalk * WALK_SPEED) / STREET_DETOUR);
          if (radius >= 180) {
            catchments.push({
              stationId: sid,
              stationName: st.name,
              lat: st.lat,
              lng: st.lng,
              arriveMin: Number(effT.toFixed(1)),
              radiusMeters: radius,
            });
          }
        }
      }
      return { minutes: threshold, reachableStationsCount: reachable, catchments };
    });
  }
}

const graphCache: Partial<Record<CityId, LocalCityGraph>> = {};
function getGraph(city: CityId): LocalCityGraph {
  if (!graphCache[city]) {
    graphCache[city] = new LocalCityGraph(NETWORKS[city]);
  }
  return graphCache[city]!;
}

export function getLocalBootstrap(city: CityId): CityBootstrap {
  const net = NETWORKS[city];
  const networkLines: NetworkPolyline[] = net.segments.map((seg) => ({
    lineId: seg.line,
    lineName: net.lines[seg.line].name,
    color: net.lines[seg.line].color,
    coordinates: seg.stops.map((sid) => [net.stations[sid].lat, net.stations[sid].lng]),
  }));
  return {
    city,
    meta: {
      name: net.name,
      country: net.country,
      baseCurrency: net.baseCurrency,
      center: net.center,
      defaultZoom: net.defaultZoom,
      passLabel: net.passLabel,
      cityMedianCommuteMin: net.cityMedianCommuteMin,
      stationCount: Object.keys(net.stations).length,
      lineCount: Object.keys(net.lines).length,
    },
    destinations: DESTINATIONS[city],
    networkLines,
  };
}

export function rankListingsLocally(req: RankRequest): RankResponse {
  const t0 = performance.now();
  const net = NETWORKS[req.city];
  const graph = getGraph(req.city);
  const items = LISTINGS.filter((l) => l.city === req.city);

  const computed = items.map((item) => {
    const routes = req.destinations.map((dest) =>
      graph.route(item.lat, item.lng, item.neighborhood, dest, req.timeWindow),
    );
    let primaryMin: number;
    let commuteScore: number;
    let fairnessDelta: number | null = null;
    let weeklyTripsMin: number;
    let totalTransfers: number;
    let maxZone: number;

    if (routes.length === 1) {
      const r0 = routes[0];
      primaryMin = r0.totalMin;
      commuteScore = r0.exactMin;
      weeklyTripsMin = r0.exactMin * 2 * req.destinations[0].daysPerWeek;
      totalTransfers = r0.transfers;
      maxZone = Math.max(item.fareZone, r0.maxZoneCrossed);
    } else {
      const [r0, r1] = routes;
      fairnessDelta = Math.abs(r0.totalMin - r1.totalMin);
      totalTransfers = Math.max(r0.transfers, r1.transfers);
      maxZone = Math.max(item.fareZone, r0.maxZoneCrossed, r1.maxZoneCrossed);
      if (req.strategy === 'fairness') {
        primaryMin = Math.max(r0.totalMin, r1.totalMin);
        commuteScore = Math.max(r0.exactMin, r1.exactMin) + 0.15 * Math.abs(r0.exactMin - r1.exactMin);
        weeklyTripsMin = ((r0.exactMin + r1.exactMin) / 2) * 10;
      } else if (req.strategy === 'balanced') {
        primaryMin = Math.round((r0.totalMin + r1.totalMin) / 2);
        commuteScore = (r0.exactMin + r1.exactMin) / 2;
        weeklyTripsMin = ((r0.exactMin + r1.exactMin) / 2) * 10;
      } else {
        const d0 = req.destinations[0].daysPerWeek;
        const d1 = req.destinations[1].daysPerWeek;
        const tot = Math.max(1, d0 + d1);
        const wAvg = (r0.exactMin * d0 + r1.exactMin * d1) / tot;
        primaryMin = Math.round(wAvg);
        commuteScore = wAvg;
        weeklyTripsMin = (r0.exactMin * d0 + r1.exactMin * d1) * 2;
      }
    }

    const weeklyHours = Number((weeklyTripsMin / 60).toFixed(1));
    const monthlyCommuteHours = Number(((weeklyTripsMin * 4.33) / 60).toFixed(1));
    const monthlyPass = routes.every((r) => r.isDirectWalk)
      ? 0
      : net.monthlyPassByZone[String(Math.min(Math.max(maxZone, 1), 4))] ?? net.monthlyPassByZone['2'];
    const trueCash = Number((item.monthlyRentLocal + monthlyPass).toFixed(1));
    const medianHours = Number(((net.cityMedianCommuteMin * 10 * 4.33) / 60).toFixed(1));
    const hoursSaved = Number((medianHours - monthlyCommuteHours).toFixed(1));
    const effectiveCost = Number((trueCash + monthlyCommuteHours * req.hourlyTimeValueLocal).toFixed(1));

    const f = req.filters;
    let matches = true;
    if (f.maxCommuteMin !== null && primaryMin > f.maxCommuteMin) matches = false;
    if (f.maxTransfers !== null && totalTransfers > f.maxTransfers) matches = false;
    if (f.bedrooms !== null && item.bedrooms !== f.bedrooms) matches = false;
    if (f.maxRentLocal !== null && item.monthlyRentLocal > f.maxRentLocal) matches = false;

    return {
      item,
      routes,
      primaryMin,
      commuteScore,
      fairnessDelta,
      weeklyHours,
      monthlyCommuteHours,
      monthlyPass,
      trueCash,
      hoursSaved,
      effectiveCost,
      totalTransfers,
      matches,
      isPareto: false,
      valueScore: 75,
    };
  });

  for (const row of computed) {
    row.isPareto = !computed.some(
      (o) =>
        o.item.id !== row.item.id &&
        o.primaryMin <= row.primaryMin &&
        o.trueCash <= row.trueCash &&
        (o.primaryMin < row.primaryMin || o.trueCash < row.trueCash),
    );
  }

  const effCosts = computed.map((c) => c.effectiveCost);
  const minEff = Math.min(...effCosts);
  const span = Math.max(1, Math.max(...effCosts) - minEff);
  for (const row of computed) {
    row.valueScore = Math.round(58 + (1 - (row.effectiveCost - minEff) / span) * 40);
  }

  computed.sort((a, b) => {
    if (a.matches !== b.matches) return a.matches ? -1 : 1;
    if (req.sortBy === 'value') return a.effectiveCost - b.effectiveCost || a.commuteScore - b.commuteScore;
    if (req.sortBy === 'true_cost') return a.trueCash - b.trueCash || a.commuteScore - b.commuteScore;
    if (req.sortBy === 'rent') return a.item.monthlyRentLocal - b.item.monthlyRentLocal || a.commuteScore - b.commuteScore;
    if (req.sortBy === 'transfers') return a.totalTransfers - b.totalTransfers || a.commuteScore - b.commuteScore;
    return a.commuteScore - b.commuteScore || a.totalTransfers - b.totalTransfers || a.trueCash - b.trueCash;
  });

  const matchingTimes = computed.filter((c) => c.matches).map((c) => c.primaryMin).sort((a, b) => a - b);

  const listings: RankedListing[] = computed.map((row, idx) => ({
    ...row.item,
    rank: idx + 1,
    primaryCommuteMin: row.primaryMin,
    commuteScoreMin: Number(row.commuteScore.toFixed(1)),
    fairnessDeltaMin: row.fairnessDelta,
    weeklyCommuteHours: row.weeklyHours,
    totalTransfers: row.totalTransfers,
    routes: row.routes,
    cost: {
      baseCurrency: row.item.baseCurrency,
      monthlyRentLocal: row.item.monthlyRentLocal,
      monthlyPassLocal: row.monthlyPass,
      passLabel: row.monthlyPass === 0 ? 'Walk to work (No transit pass needed)' : net.passLabel,
      trueMonthlyCashLocal: row.trueCash,
      monthlyCommuteHours: row.monthlyCommuteHours,
      hoursSavedVsMedian: row.hoursSaved,
      effectiveMonthlyCostLocal: row.effectiveCost,
      valueScore: row.valueScore,
    },
    isParetoOptimal: row.isPareto,
    matchesFilters: row.matches,
  }));

  return {
    city: req.city,
    timeWindow: req.timeWindow,
    strategy: req.strategy,
    sortBy: req.sortBy,
    summary: {
      totalListings: listings.length,
      matchingListings: matchingTimes.length,
      fastestMin: matchingTimes[0] ?? null,
      medianMin: matchingTimes.length > 0 ? matchingTimes[Math.floor(matchingTimes.length / 2)] : null,
      cityMedianMin: net.cityMedianCommuteMin,
      computeMs: Number((performance.now() - t0).toFixed(2)),
      engine: 'Client Parity Engine',
    },
    isochrones: graph.computeIsochrones(req.destinations, req.timeWindow),
    listings,
  };
}
