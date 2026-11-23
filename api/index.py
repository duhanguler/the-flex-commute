from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

_API_DIR = str(Path(__file__).resolve().parent)
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from _backend.models import CityId, InquiryRequest, InquiryResponse, RankRequest, RankResponse
from _backend.transit import load_destinations, load_listings, load_networks, rank_listings

app = FastAPI(
    title="The Flex — Commute Finder API",
    version="1.0.0",
    description=(
        "Serverless Python FastAPI transit routing & furnished apartment ranking engine "
        "for The Flex across London (TfL Tube, Elizabeth Line, Overground, DLR) and Paris (RATP Métro & RER)."
    ),
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CITY_BOUNDS: dict[str, tuple[float, float, float, float]] = {
    # (min_lng, max_lat, max_lng, min_lat) for Nominatim viewbox
    "london": (-0.36, 51.62, 0.14, 51.40),
    "paris": (2.15, 48.94, 2.48, 48.78),
}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "the-flex-commute-api", "runtime": "python-fastapi"}


@app.get("/api/bootstrap")
def bootstrap(city: CityId = Query(default="london")) -> dict[str, Any]:
    networks = load_networks()
    destinations = load_destinations()
    net = networks[city]

    # Build lightweight polyline segments for the optional Transit Network Map Layer
    network_polylines = []
    for seg in net["segments"]:
        line = net["lines"][seg["line"]]
        coords = [[net["stations"][sid]["lat"], net["stations"][sid]["lng"]] for sid in seg["stops"]]
        network_polylines.append(
            {
                "lineId": seg["line"],
                "lineName": line["name"],
                "color": line["color"],
                "coordinates": coords,
            }
        )

    return {
        "city": city,
        "meta": {
            "name": net["name"],
            "country": net["country"],
            "baseCurrency": net["baseCurrency"],
            "center": net["center"],
            "defaultZoom": net["defaultZoom"],
            "passLabel": net["passLabel"],
            "cityMedianCommuteMin": net["cityMedianCommuteMin"],
            "stationCount": len(net["stations"]),
            "lineCount": len(net["lines"]),
        },
        "destinations": destinations[city],
        "networkLines": network_polylines,
    }


@app.post("/api/commute/rank", response_model=RankResponse)
def commute_rank(payload: RankRequest) -> RankResponse:
    return rank_listings(payload)


@app.get("/api/geocode")
def geocode(
    city: CityId = Query(default="london"),
    q: str = Query(..., min_length=2, max_length=120),
) -> dict[str, Any]:
    """Geocode any free-text workplace, university, street, or postcode bounded to London or Paris."""
    min_lng, max_lat, max_lng, min_lat = CITY_BOUNDS[city]
    city_suffix = "London, UK" if city == "london" else "Paris, France"
    query_str = q if city.lower() in q.lower() else f"{q}, {city_suffix}"

    params = urllib.parse.urlencode(
        {
            "q": query_str,
            "format": "jsonv2",
            "limit": 5,
            "bounded": 1,
            "viewbox": f"{min_lng},{max_lat},{max_lng},{min_lat}",
            "addressdetails": 1,
        }
    )
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "TheFlexCommuteFinder/1.0 (portfolio-application; contact@theflex-commute.vercel.app)",
            "Accept-Language": "en",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return {"results": [], "source": "nominatim_unavailable"}

    results = []
    for item in raw:
        lat = float(item["lat"])
        lng = float(item["lon"])
        if not (min_lat <= lat <= max_lat and min_lng <= lng <= max_lng):
            continue
        display = item.get("display_name", q)
        parts = [p.strip() for p in display.split(",")]
        short_name = parts[0] if parts else q
        subtitle = ", ".join(parts[1:3]) if len(parts) > 1 else city_suffix
        results.append(
            {
                "id": f"osm-{item.get('place_id', uuid.uuid4().hex[:8])}",
                "name": short_name,
                "shortName": short_name,
                "subtitle": subtitle,
                "category": "custom",
                "lat": lat,
                "lng": lng,
            }
        )
    return {"results": results, "source": "nominatim"}


@app.post("/api/inquiries", response_model=InquiryResponse)
def submit_inquiry(payload: InquiryRequest) -> InquiryResponse:
    listings = load_listings()
    match = next((l for l in listings if l["id"] == payload.listingId), None)
    if not match:
        raise HTTPException(status_code=404, detail="Listing not found")
    ref = f"FLX-{uuid.uuid4().hex[:6].upper()}"
    return InquiryResponse(
        referenceId=ref,
        listingTitle=match["title"],
        message=(
            f"Flexible stay request received for {match['title']} ({payload.stayMonths} mo starting "
            f"{payload.moveInDate}). A Flex relocation specialist will follow up with {payload.email}."
        ),
    )


# Optional SPA static mount for self-contained Docker runs (ignored on Vercel serverless)
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

_DIST_DIR = Path(__file__).resolve().parent.parent / "dist"
if _DIST_DIR.is_dir():
    _assets = _DIST_DIR / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        candidate = _DIST_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(_DIST_DIR / "index.html"))

