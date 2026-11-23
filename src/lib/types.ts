export type CityId = 'london' | 'paris';
export type CurrencyCode = 'GBP' | 'EUR';
export type TimeWindow = 'peak' | 'off_peak';
export type MultiModeStrategy = 'fairness' | 'balanced' | 'hybrid';
export type SortBy = 'commute' | 'value' | 'true_cost' | 'rent' | 'transfers';

export interface CuratedDestination {
  id: string;
  name: string;
  shortName: string;
  category: 'university' | 'workplace' | 'custom';
  subtitle: string;
  lat: number;
  lng: number;
}

export interface DestinationInput {
  id: string;
  name: string;
  shortName?: string;
  subtitle?: string;
  category?: 'university' | 'workplace' | 'custom';
  lat: number;
  lng: number;
  daysPerWeek: number;
}

export interface RankFilters {
  maxCommuteMin: number | null;
  maxTransfers: number | null;
  bedrooms: number | null;
  maxRentLocal: number | null;
}

export interface RankRequest {
  city: CityId;
  destinations: DestinationInput[];
  timeWindow: TimeWindow;
  strategy: MultiModeStrategy;
  sortBy: SortBy;
  hourlyTimeValueLocal: number;
  filters: RankFilters;
}

export interface SummaryLineBadge {
  id: string;
  name: string;
  shortName: string;
  color: string;
  textColor: string;
  stops: string;
}

export interface TransitLeg {
  kind: 'walk' | 'transit' | 'transfer';
  durationMin: number;
  distanceMeters?: number | null;
  lineId?: string | null;
  lineName?: string | null;
  lineShortName?: string | null;
  lineColor?: string | null;
  lineTextColor?: string | null;
  mode?: string | null;
  fromName: string;
  toName: string;
  stopsCount: number;
  stopNames: string[];
  coordinates: [number, number][];
}

export interface CommuteRoute {
  destinationId: string;
  destinationName: string;
  totalMin: number;
  exactMin: number;
  walkMin: number;
  transitMin: number;
  waitAndTransferMin: number;
  transfers: number;
  maxZoneCrossed: number;
  isDirectWalk: boolean;
  summaryLines: SummaryLineBadge[];
  legs: TransitLeg[];
}

export interface CostBreakdown {
  baseCurrency: CurrencyCode;
  monthlyRentLocal: number;
  monthlyPassLocal: number;
  passLabel: string;
  trueMonthlyCashLocal: number;
  monthlyCommuteHours: number;
  hoursSavedVsMedian: number;
  effectiveMonthlyCostLocal: number;
  valueScore: number;
}

export interface RankedListing {
  id: string;
  slug: string;
  city: CityId;
  title: string;
  neighborhood: string;
  postcode: string;
  address: string;
  lat: number;
  lng: number;
  fareZone: number;
  baseCurrency: CurrencyCode;
  monthlyRentLocal: number;
  bedrooms: number;
  bathrooms: number;
  areaSqm: number;
  maxGuests: number;
  minStayDays: number;
  availableFrom: string;
  rating: number;
  reviewCount: number;
  flexTier: string;
  workspaceSpec: string;
  amenities: string[];
  image: string;
  description: string;
  rank: number;
  primaryCommuteMin: number;
  commuteScoreMin: number;
  fairnessDeltaMin: number | null;
  weeklyCommuteHours: number;
  totalTransfers: number;
  routes: CommuteRoute[];
  cost: CostBreakdown;
  isParetoOptimal: boolean;
  matchesFilters: boolean;
}

export interface IsochroneCatchment {
  stationId: string;
  stationName: string;
  lat: number;
  lng: number;
  arriveMin: number;
  radiusMeters: number;
}

export interface IsochroneBand {
  minutes: number;
  reachableStationsCount: number;
  catchments: IsochroneCatchment[];
}

export interface RankSummary {
  totalListings: number;
  matchingListings: number;
  fastestMin: number | null;
  medianMin: number | null;
  cityMedianMin: number;
  computeMs: number;
  engine: string;
}

export interface RankResponse {
  city: CityId;
  timeWindow: TimeWindow;
  strategy: MultiModeStrategy;
  sortBy: SortBy;
  summary: RankSummary;
  isochrones: IsochroneBand[];
  listings: RankedListing[];
}

export interface NetworkPolyline {
  lineId: string;
  lineName: string;
  color: string;
  coordinates: [number, number][];
}

export interface CityBootstrap {
  city: CityId;
  meta: {
    name: string;
    country: string;
    baseCurrency: CurrencyCode;
    center: [number, number];
    defaultZoom: number;
    passLabel: string;
    cityMedianCommuteMin: number;
    stationCount: number;
    lineCount: number;
  };
  destinations: CuratedDestination[];
  networkLines: NetworkPolyline[];
}

export interface InquiryRequest {
  listingId: string;
  fullName: string;
  email: string;
  moveInDate: string;
  stayMonths: number;
  commuteDestination?: string;
  notes?: string;
}

export interface InquiryResponse {
  referenceId: string;
  status: 'received';
  message: string;
  listingTitle: string;
}
