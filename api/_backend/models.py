from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


CityId = Literal["london", "paris"]
TimeWindow = Literal["peak", "off_peak"]
MultiModeStrategy = Literal["fairness", "balanced", "hybrid"]
SortBy = Literal["commute", "value", "true_cost", "rent", "transfers"]


class DestinationInput(BaseModel):
    id: str = Field(..., description="Preset ID or custom geocoded place ID")
    name: str = Field(..., min_length=1, max_length=120)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    daysPerWeek: int = Field(default=5, ge=1, le=7)


class RankFilters(BaseModel):
    maxCommuteMin: int | None = Field(default=None, ge=5, le=120)
    maxTransfers: int | None = Field(default=None, ge=0, le=3)
    bedrooms: int | None = Field(default=None, ge=0, le=4)
    maxRentLocal: int | None = Field(default=None, ge=500, le=15000)


class RankRequest(BaseModel):
    city: CityId = "london"
    destinations: list[DestinationInput] = Field(..., min_length=1, max_length=2)
    timeWindow: TimeWindow = "peak"
    strategy: MultiModeStrategy = "fairness"
    sortBy: SortBy = "commute"
    hourlyTimeValueLocal: float = Field(default=25.0, ge=0, le=200)
    filters: RankFilters = Field(default_factory=RankFilters)


class TransitLeg(BaseModel):
    kind: Literal["walk", "transit", "transfer"]
    durationMin: float
    distanceMeters: int | None = None
    lineId: str | None = None
    lineName: str | None = None
    lineShortName: str | None = None
    lineColor: str | None = None
    lineTextColor: str | None = None
    mode: str | None = None
    fromName: str
    toName: str
    stopsCount: int = 0
    stopNames: list[str] = Field(default_factory=list)
    coordinates: list[list[float]] = Field(default_factory=list)


class CommuteRoute(BaseModel):
    destinationId: str
    destinationName: str
    totalMin: int
    exactMin: float
    walkMin: int
    transitMin: int
    waitAndTransferMin: int
    transfers: int
    maxZoneCrossed: int
    isDirectWalk: bool = False
    summaryLines: list[dict] = Field(default_factory=list)
    legs: list[TransitLeg] = Field(default_factory=list)


class CostBreakdown(BaseModel):
    baseCurrency: Literal["GBP", "EUR"]
    monthlyRentLocal: int
    monthlyPassLocal: float
    passLabel: str
    trueMonthlyCashLocal: float
    monthlyCommuteHours: float
    hoursSavedVsMedian: float
    effectiveMonthlyCostLocal: float
    valueScore: int


class RankedListing(BaseModel):
    id: str
    slug: str
    city: CityId
    title: str
    neighborhood: str
    postcode: str
    address: str
    lat: float
    lng: float
    fareZone: int
    baseCurrency: Literal["GBP", "EUR"]
    monthlyRentLocal: int
    bedrooms: int
    bathrooms: int
    areaSqm: int
    maxGuests: int
    minStayDays: int
    availableFrom: str
    rating: float
    reviewCount: int
    flexTier: str
    workspaceSpec: str
    amenities: list[str]
    image: str
    description: str
    rank: int
    primaryCommuteMin: int
    commuteScoreMin: float
    fairnessDeltaMin: int | None = None
    weeklyCommuteHours: float
    totalTransfers: int
    routes: list[CommuteRoute]
    cost: CostBreakdown
    isParetoOptimal: bool
    matchesFilters: bool


class IsochroneCatchment(BaseModel):
    stationId: str
    stationName: str
    lat: float
    lng: float
    arriveMin: float
    radiusMeters: int


class IsochroneBand(BaseModel):
    minutes: int
    reachableStationsCount: int
    catchments: list[IsochroneCatchment]


class RankSummary(BaseModel):
    totalListings: int
    matchingListings: int
    fastestMin: int | None
    medianMin: int | None
    cityMedianMin: int
    computeMs: float
    engine: str = "FastAPI Python"


class RankResponse(BaseModel):
    city: CityId
    timeWindow: TimeWindow
    strategy: MultiModeStrategy
    sortBy: SortBy
    summary: RankSummary
    isochrones: list[IsochroneBand]
    listings: list[RankedListing]


class InquiryRequest(BaseModel):
    listingId: str
    fullName: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=5, max_length=120)
    moveInDate: str = Field(..., min_length=4, max_length=32)
    stayMonths: int = Field(default=3, ge=1, le=24)
    commuteDestination: str | None = None
    notes: str | None = Field(default=None, max_length=600)


class InquiryResponse(BaseModel):
    referenceId: str
    status: Literal["received"] = "received"
    message: str
    listingTitle: str
