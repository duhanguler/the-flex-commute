import { List, Map as MapIcon, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnalyticsModal } from './components/AnalyticsModal';
import { CommuteMap } from './components/CommuteMap';
import { CommuteSearchBar } from './components/CommuteSearchBar';
import { Header } from './components/Header';
import { ListingCard } from './components/ListingCard';
import { ListingDetailDrawer } from './components/ListingDetailDrawer';
import { fetchBootstrap, fetchRankedCommutes } from './lib/api';
import { getLocalBootstrap, rankListingsLocally } from './lib/fallbackEngine';
import type {
  CityBootstrap,
  CityId,
  CurrencyCode,
  CuratedDestination,
  DestinationInput,
  MultiModeStrategy,
  RankFilters,
  RankRequest,
  RankResponse,
  SortBy,
  TimeWindow,
} from './lib/types';
import { readUrlState, syncUrlState } from './lib/urlState';

function toDestInput(d: CuratedDestination, daysPerWeek: number): DestinationInput {
  return {
    id: d.id,
    name: d.name,
    shortName: d.shortName,
    subtitle: d.subtitle,
    category: d.category,
    lat: d.lat,
    lng: d.lng,
    daysPerWeek,
  };
}

const DEFAULT_FILTERS: RankFilters = {
  maxCommuteMin: null,
  maxTransfers: null,
  bedrooms: null,
  maxRentLocal: null,
};

export function App() {
  const initialUrl = useMemo(() => readUrlState(), []);
  const initialCity: CityId = initialUrl.city ?? 'london';
  const initialBootstrap = useMemo(() => getLocalBootstrap(initialCity), [initialCity]);

  const initialDestA = useMemo(() => {
    if (initialUrl.customDestA) return initialUrl.customDestA;
    const match = initialUrl.destAId
      ? initialBootstrap.destinations.find((d) => d.id === initialUrl.destAId)
      : initialBootstrap.destinations[0];
    return toDestInput(match || initialBootstrap.destinations[0], 5);
  }, [initialBootstrap, initialUrl.customDestA, initialUrl.destAId]);

  const initialDestB = useMemo(() => {
    if (initialUrl.customDestB) return initialUrl.customDestB;
    if (!initialUrl.destBId) return null;
    const match = initialBootstrap.destinations.find((d) => d.id === initialUrl.destBId);
    return match ? toDestInput(match, 2) : null;
  }, [initialBootstrap, initialUrl.customDestB, initialUrl.destBId]);

  const [city, setCity] = useState<CityId>(initialCity);
  const [bootstrap, setBootstrap] = useState<CityBootstrap>(initialBootstrap);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(
    initialUrl.currency ?? initialBootstrap.meta.baseCurrency,
  );
  const [destA, setDestA] = useState<DestinationInput>(initialDestA);
  const [destB, setDestB] = useState<DestinationInput | null>(initialDestB);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(initialUrl.timeWindow ?? 'peak');
  const [strategy, setStrategy] = useState<MultiModeStrategy>(initialUrl.strategy ?? 'fairness');
  const [sortBy, setSortBy] = useState<SortBy>(initialUrl.sortBy ?? 'commute');
  const [hourlyValue, setHourlyValue] = useState<number>(initialUrl.hourlyValue ?? 25);
  const [filters, setFilters] = useState<RankFilters>(initialUrl.filters ?? DEFAULT_FILTERS);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [analyticsTab, setAnalyticsTab] = useState<'matrix' | 'compare' | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');

  const rankRequest = useMemo<RankRequest>(
    () => ({
      city,
      destinations: destB ? [destA, destB] : [destA],
      timeWindow,
      strategy,
      sortBy,
      hourlyTimeValueLocal: hourlyValue,
      filters,
    }),
    [city, destA, destB, timeWindow, strategy, sortBy, hourlyValue, filters],
  );

  // Instant optimistic local calculation, hydrated cleanly by Python FastAPI
  const [rankData, setRankData] = useState<RankResponse>(() => rankListingsLocally(rankRequest));
  const [liveApi, setLiveApi] = useState(false);

  // Load city bootstrap from FastAPI
  useEffect(() => {
    let cancelled = false;
    fetchBootstrap(city).then(({ data, liveApi: isLive }) => {
      if (cancelled) return;
      setBootstrap(data);
      if (isLive) setLiveApi(true);
    });
    return () => {
      cancelled = true;
    };
  }, [city]);

  // Rank commutes via Python FastAPI (short debounce avoids request storms during slider drag)
  useEffect(() => {
    let cancelled = false;
    setRankData(rankListingsLocally(rankRequest));
    const timer = setTimeout(() => {
      fetchRankedCommutes(rankRequest).then(({ data, liveApi: isLive }) => {
        if (cancelled) return;
        setRankData(data);
        setLiveApi(isLive);
      });
    }, 90);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rankRequest]);

  // Deep-link URL sync (including custom geocoded / dropped-pin destinations)
  useEffect(() => {
    syncUrlState({
      city,
      currency: displayCurrency,
      destA,
      destB,
      timeWindow,
      strategy,
      sortBy,
      hourlyValue,
      filters,
    });
  }, [city, displayCurrency, destA, destB, timeWindow, strategy, sortBy, hourlyValue, filters]);

  const handleCityChange = useCallback(
    (nextCity: CityId) => {
      if (nextCity === city) return;
      const nextBoot = getLocalBootstrap(nextCity);
      setCity(nextCity);
      setBootstrap(nextBoot);
      setDisplayCurrency(nextBoot.meta.baseCurrency);
      setDestA(toDestInput(nextBoot.destinations[0], 5));
      setDestB(null);
      setFilters(DEFAULT_FILTERS);
      setSelectedId(null);
      setDrawerOpen(false);
      setCompareIds([]);
    },
    [city],
  );

  const handleAddDestB = useCallback(() => {
    const candidate =
      bootstrap.destinations.find((d) => d.id !== destA.id && d.category !== destA.category) ||
      bootstrap.destinations.find((d) => d.id !== destA.id);
    if (!candidate) return;
    setDestA((prev) => ({ ...prev, daysPerWeek: 3 }));
    setDestB(toDestInput(candidate, 2));
  }, [bootstrap.destinations, destA]);

  const handleMapDropPin = useCallback(
    (lat: number, lng: number) => {
      const custom: DestinationInput = {
        id: `pin-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        name: `Pinned Spot (${lat.toFixed(3)}, ${lng.toFixed(3)})`,
        shortName: 'Map Pin',
        subtitle: `${city === 'london' ? 'London' : 'Paris'} · ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        category: 'custom',
        lat,
        lng,
        daysPerWeek: destB ? destB.daysPerWeek : destA.daysPerWeek,
      };
      if (destB) {
        setDestB(custom);
      } else {
        setDestA(custom);
      }
    },
    [city, destA.daysPerWeek, destB],
  );

  const handleToggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }, []);

  const handleSelectListing = useCallback((id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  }, []);

  const selectedListing = useMemo(
    () => rankData.listings.find((l) => l.id === selectedId) ?? null,
    [rankData.listings, selectedId],
  );

  const matchingListings = useMemo(
    () => rankData.listings.filter((l) => l.matchesFilters),
    [rankData.listings],
  );
  const excludedListings = useMemo(
    () => rankData.listings.filter((l) => !l.matchesFilters),
    [rankData.listings],
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#FCFBF7] text-[#18211F]">
      <Header
        city={city}
        onCityChange={handleCityChange}
        currency={displayCurrency}
        onCurrencyChange={setDisplayCurrency}
        timeWindow={timeWindow}
        onTimeWindowChange={setTimeWindow}
        compareCount={compareIds.length}
        onOpenAnalytics={(tab) => setAnalyticsTab(tab)}
        apiStatus={{
          liveApi,
          computeMs: rankData.summary.computeMs,
          engine: rankData.summary.engine,
        }}
      />

      <CommuteSearchBar
        city={city}
        baseCurrency={bootstrap.meta.baseCurrency}
        displayCurrency={displayCurrency}
        curated={bootstrap.destinations}
        destA={destA}
        destB={destB}
        onDestAChange={setDestA}
        onDestBChange={setDestB}
        onAddDestB={handleAddDestB}
        strategy={strategy}
        onStrategyChange={setStrategy}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Split-Screen Main Workspace (isolated stacking context so map never overlaps dropdowns!) */}
      <main className="isolate relative z-0 flex min-h-0 flex-1 overflow-hidden">
        {/* Left Pane: Ranked Apartment List */}
        <section
          aria-label="Ranked apartments"
          className={`flex h-full w-full flex-col border-r border-[#E6E0D2] bg-[#FCFBF7] min-[900px]:w-[48%] xl:w-[45%] ${
            mobileView === 'map' ? 'hidden min-[900px]:flex' : 'flex'
          }`}
        >
          {/* Editorial Summary Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEAE0] bg-[#FCFBF7] px-4 py-2.5 lg:px-5">
            <div>
              <h1 className="font-serif-editorial text-[18px] font-medium leading-tight text-[#18211F]">
                <span className="tabular-nums">{rankData.summary.matchingListings}</span>{' '}
                {bootstrap.meta.name} stays ranked{' '}
                <span className="italic text-[#284E4C]">
                  for {destA.shortName || destA.name}
                  {destB ? ` & ${destB.shortName || destB.name}` : ''}
                </span>
              </h1>
              <p className="mt-0.5 tabular-nums text-[12px] text-[#5F6866]">
                {rankData.summary.fastestMin !== null ? (
                  <>
                    Fastest <strong className="text-[#18211F]">{rankData.summary.fastestMin} min</strong>
                    {' · '}Portfolio median{' '}
                    <strong className="text-[#18211F]">{rankData.summary.medianMin} min</strong>
                    {' · '}City avg {rankData.summary.cityMedianMin} min
                  </>
                ) : (
                  'No apartments match your current filters'
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAnalyticsTab('matrix')}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#DCD5C6] bg-[#F7F4EC] px-2.5 py-1.5 font-ui text-[11px] font-semibold text-[#284E4C] transition-colors hover:border-[#284E4C] hover:bg-[#E4EDEA]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Pareto Trade-off
            </button>
          </div>

          {/* Scrollable Cards */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5 pb-20 lg:px-5 lg:pb-6">
            {matchingListings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#CFC7B6] bg-white p-8 text-center">
                <SlidersHorizontal className="mx-auto h-7 w-7 text-[#8A918F]" />
                <h2 className="mt-3 font-serif-editorial text-[19px] font-medium text-[#18211F]">
                  No residences match these exact constraints
                </h2>
                <p className="mt-1 text-[13px] text-[#5F6866]">
                  Try relaxing your maximum commute cap, budget ceiling, or transfer filter.
                </p>
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="mt-4 cursor-pointer rounded-lg bg-[#284E4C] px-4 py-2 font-ui text-[12px] font-semibold text-[#FCFBF7] hover:bg-[#1D3B39]"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              matchingListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  displayCurrency={displayCurrency}
                  isSelected={selectedId === listing.id}
                  isHovered={hoveredId === listing.id}
                  isCompared={compareIds.includes(listing.id)}
                  hasSecondDest={Boolean(destB)}
                  strategy={strategy}
                  onSelect={() => handleSelectListing(listing.id)}
                  onHover={(h) => setHoveredId(h ? listing.id : null)}
                  onToggleCompare={() => handleToggleCompare(listing.id)}
                />
              ))
            )}

            {excludedListings.length > 0 && (
              <div className="pt-2">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="h-px flex-1 bg-[#E6E0D2]" />
                  <span className="font-ui text-[11px] font-medium text-[#7A817F]">
                    Outside current filters ({excludedListings.length})
                  </span>
                  <div className="h-px flex-1 bg-[#E6E0D2]" />
                </div>
                <div className="space-y-3">
                  {excludedListings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      displayCurrency={displayCurrency}
                      isSelected={selectedId === listing.id}
                      isHovered={hoveredId === listing.id}
                      isCompared={compareIds.includes(listing.id)}
                      hasSecondDest={Boolean(destB)}
                      strategy={strategy}
                      onSelect={() => handleSelectListing(listing.id)}
                      onHover={(h) => setHoveredId(h ? listing.id : null)}
                      onToggleCompare={() => handleToggleCompare(listing.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Pane: Full-Height Interactive Transit Map */}
        <section
          aria-label="Interactive transit map"
          className={`h-full flex-1 ${mobileView === 'list' ? 'hidden min-[900px]:block' : 'block'}`}
        >
          <CommuteMap
            city={city}
            center={bootstrap.meta.center}
            defaultZoom={bootstrap.meta.defaultZoom}
            destinations={rankRequest.destinations}
            listings={rankData.listings}
            isochrones={rankData.isochrones}
            networkLines={bootstrap.networkLines}
            displayCurrency={displayCurrency}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelectListing={handleSelectListing}
            onHoverListing={setHoveredId}
            onDropPin={handleMapDropPin}
          />
        </section>

        {/* Mobile / Narrow Viewport Floating List / Map Toggle */}
        <div className="fixed bottom-4 left-1/2 z-[600] -translate-x-1/2 min-[900px]:hidden">
          <button
            type="button"
            onClick={() => setMobileView((v) => (v === 'list' ? 'map' : 'list'))}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#18211F] px-4 py-2.5 font-ui text-[13px] font-semibold text-[#FCFBF7] shadow-[0_10px_28px_rgba(24,33,31,0.3)]"
          >
            {mobileView === 'list' ? (
              <>
                <MapIcon className="h-4 w-4" />
                Show Transit Map
              </>
            ) : (
              <>
                <List className="h-4 w-4" />
                Show Ranked List ({rankData.summary.matchingListings})
              </>
            )}
          </button>
        </div>
      </main>

      {/* Property & Full Commute Itinerary Slide-Over Drawer (Left side so map + route stay visible!) */}
      {drawerOpen && selectedListing && (
        <ListingDetailDrawer
          listing={selectedListing}
          displayCurrency={displayCurrency}
          timeWindow={timeWindow}
          hourlyTimeValueLocal={hourlyValue}
          onHourlyTimeValueChange={setHourlyValue}
          isCompared={compareIds.includes(selectedListing.id)}
          onToggleCompare={() => handleToggleCompare(selectedListing.id)}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* Pareto Value Matrix & Side-by-Side Comparison Modal */}
      {analyticsTab && (
        <AnalyticsModal
          initialTab={analyticsTab}
          listings={rankData.listings}
          compareIds={compareIds}
          displayCurrency={displayCurrency}
          baseCurrency={bootstrap.meta.baseCurrency}
          hourlyTimeValueLocal={hourlyValue}
          onHourlyTimeValueChange={setHourlyValue}
          onToggleCompare={handleToggleCompare}
          onSelectListing={handleSelectListing}
          onClose={() => setAnalyticsTab(null)}
        />
      )}
    </div>
  );
}

export default App;
