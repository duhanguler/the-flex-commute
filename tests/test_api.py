from fastapi.testclient import TestClient

from api.index import app
from api._backend.transit import load_destinations, load_listings, load_networks

client = TestClient(app)


def test_data_integrity() -> None:
    networks = load_networks()
    destinations = load_destinations()
    listings = load_listings()

    for city in ("london", "paris"):
        net = networks[city]
        stations = net["stations"]
        lines = net["lines"]
        for seg in net["segments"]:
            assert seg["line"] in lines
            assert len(seg["stops"]) == len(seg["times"]) + 1
            for sid in seg["stops"]:
                assert sid in stations, f"Missing station {sid} in {city}"
        for inter in net["interchanges"]:
            assert inter["from"] in stations
            assert inter["to"] in stations
        assert len(destinations[city]) >= 10

    assert len([l for l in listings if l["city"] == "london"]) == 16
    assert len([l for l in listings if l["city"] == "paris"]) == 14


def test_health_and_bootstrap() -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    for city in ("london", "paris"):
        b = client.get(f"/api/bootstrap?city={city}")
        assert b.status_code == 200
        body = b.json()
        assert body["city"] == city
        assert len(body["destinations"]) >= 10
        assert len(body["networkLines"]) >= 10


def test_london_canonical_routes() -> None:
    # 1. UCL Bloomsbury: Fitzrovia apartment should be #1 via direct walk, Brixton via Victoria Line
    res = client.post(
        "/api/commute/rank",
        json={
            "city": "london",
            "destinations": [
                {"id": "ucl", "name": "UCL — University College London", "lat": 51.5246, "lng": -0.1340, "daysPerWeek": 5}
            ],
            "timeWindow": "peak",
            "sortBy": "commute",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["summary"]["matchingListings"] == 16
    top = data["listings"][0]
    assert top["id"] == "lon-02"  # Fitzrovia right beside UCL
    assert top["routes"][0]["isDirectWalk"] is True
    assert top["primaryCommuteMin"] <= 10

    brixton = next(l for l in data["listings"] if l["id"] == "lon-13")
    line_ids = [ln["id"] for ln in brixton["routes"][0]["summaryLines"]]
    assert "victoria" in line_ids
    assert brixton["routes"][0]["transfers"] == 0

    # Isochrones strictly expand
    iso_counts = [b["reachableStationsCount"] for b in data["isochrones"]]
    assert iso_counts[0] < iso_counts[1] <= iso_counts[2]

    # 2. Canary Wharf: Paddington should use Elizabeth Line direct & Peak > Off-Peak on rail commutes
    cw_peak = client.post(
        "/api/commute/rank",
        json={
            "city": "london",
            "destinations": [
                {"id": "cw", "name": "Canary Wharf", "lat": 51.5049, "lng": -0.0195, "daysPerWeek": 5}
            ],
            "timeWindow": "peak",
        },
    ).json()
    cw_off = client.post(
        "/api/commute/rank",
        json={
            "city": "london",
            "destinations": [
                {"id": "cw", "name": "Canary Wharf", "lat": 51.5049, "lng": -0.0195, "daysPerWeek": 5}
            ],
            "timeWindow": "off_peak",
        },
    ).json()
    pad = next(l for l in cw_peak["listings"] if l["id"] == "lon-01")
    pad_off = next(l for l in cw_off["listings"] if l["id"] == "lon-01")
    pad_lines = [ln["id"] for ln in pad["routes"][0]["summaryLines"]]
    assert "elizabeth" in pad_lines
    assert pad["primaryCommuteMin"] > pad_off["primaryCommuteMin"]
    for l in cw_peak["listings"]:
        r = l["routes"][0]
        if not r["isDirectWalk"]:
            assert r["walkMin"] + r["transitMin"] + r["waitAndTransferMin"] == r["totalMin"]


def test_paris_canonical_routes_and_multidest() -> None:
    # Station F + La Défense multi-destination fairness
    res = client.post(
        "/api/commute/rank",
        json={
            "city": "paris",
            "destinations": [
                {"id": "station_f", "name": "Station F", "lat": 48.8344, "lng": 2.3709, "daysPerWeek": 3},
                {"id": "la_defense_hub", "name": "La Défense", "lat": 48.8924, "lng": 2.2369, "daysPerWeek": 2},
            ],
            "timeWindow": "peak",
            "strategy": "fairness",
            "sortBy": "commute",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["listings"]) == 14
    for listing in data["listings"]:
        assert len(listing["routes"]) == 2
        assert listing["fairnessDeltaMin"] is not None

    # Clichy apartment to Station F should ride Métro 14 direct!
    clichy = next(l for l in data["listings"] if l["id"] == "par-13")
    st_f_lines = [ln["id"] for ln in clichy["routes"][0]["summaryLines"]]
    assert "m14" in st_f_lines
    assert clichy["routes"][0]["transfers"] == 0


def test_inquiry_submission() -> None:
    res = client.post(
        "/api/inquiries",
        json={
            "listingId": "lon-01",
            "fullName": "Alex Mercer",
            "email": "alex@company.co.uk",
            "moveInDate": "2026-12-01",
            "stayMonths": 6,
            "commuteDestination": "Canary Wharf",
        },
    )
    assert res.status_code == 200
    assert res.json()["referenceId"].startswith("FLX-")
