import { Award, Check, Plus, Star, Wifi } from 'lucide-react';
import { bedroomsLabel, formatMoney } from '../lib/currency';
import type { CurrencyCode, MultiModeStrategy, RankedListing } from '../lib/types';
import { TransitTimeline } from './TransitTimeline';

interface ListingCardProps {
  listing: RankedListing;
  displayCurrency: CurrencyCode;
  isSelected: boolean;
  isHovered: boolean;
  isCompared: boolean;
  hasSecondDest: boolean;
  strategy: MultiModeStrategy;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onToggleCompare: () => void;
}

export function ListingCard({
  listing,
  displayCurrency,
  isSelected,
  isHovered,
  isCompared,
  hasSecondDest,
  strategy,
  onSelect,
  onHover,
  onToggleCompare,
}: ListingCardProps) {
  const commuteTone =
    listing.primaryCommuteMin <= 20
      ? 'bg-[#EAF4EE] text-[#1F7A55] border-[#CFE2D8]'
      : listing.primaryCommuteMin <= 34
        ? 'bg-[#E4EDEA] text-[#284E4C] border-[#B9CFCA]'
        : 'bg-[#FBF1DE] text-[#8A5A12] border-[#E8D5AE]';

  const routeA = listing.routes[0];
  const routeB = listing.routes[1];

  return (
    <article
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onSelect}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-white transition-all duration-150 ${
        isSelected
          ? 'border-[#284E4C] ring-2 ring-[#284E4C]/18'
          : isHovered
            ? 'border-[#B9B09B] shadow-[0_6px_18px_rgba(24,33,31,0.06)]'
            : 'border-[#E6E0D2]'
      } ${!listing.matchesFilters ? 'opacity-55' : ''}`}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Left: Crisp Architectural Photo */}
        <div className="relative h-44 w-full shrink-0 overflow-hidden bg-[#EFEAE0] sm:h-auto sm:w-40 lg:w-42">
          <img
            src={listing.image}
            alt={listing.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />

          {/* Rank badge */}
          <div className="absolute left-2.5 top-2.5 flex items-center gap-1">
            <span className="tabular-nums rounded-md bg-[#18211F]/88 px-2 py-0.5 font-ui text-[11px] font-semibold text-[#FCFBF7] backdrop-blur-xs">
              #{listing.rank}
            </span>
            <span className="rounded-md bg-[#FCFBF7]/92 px-1.5 py-0.5 font-ui text-[10px] font-semibold text-[#4A5452] backdrop-blur-xs">
              Zone {listing.fareZone}
            </span>
          </div>

          {/* Pareto Optimal Trade-off Indicator */}
          {listing.isParetoOptimal && (
            <div
              className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-md bg-[#284E4C]/92 px-2 py-0.5 font-ui text-[10px] font-semibold text-[#FCFBF7] backdrop-blur-xs"
              title="Pareto-optimal: no other flat is both faster to commute and lower total monthly cost"
            >
              <Award className="h-3 w-3 text-[#E3C17A]" />
              Optimal Trade-off
            </div>
          )}
        </div>

        {/* Right: Structured Editorial Content */}
        <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5">
          <div>
            {/* Top row: Neighborhood + Commute Hero Pill */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#6A7270]">
                  <span className="truncate font-ui">{listing.neighborhood}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5 text-[#18211F]">
                    <Star className="h-3 w-3 fill-[#8A5A12] text-[#8A5A12]" />
                    <span className="tabular-nums">{listing.rating.toFixed(2)}</span>
                  </span>
                </div>
                <h3 className="mt-0.5 line-clamp-2 font-serif-editorial text-[16.5px] font-medium leading-snug text-[#18211F] group-hover:text-[#284E4C]">
                  {listing.title}
                </h3>
              </div>

              {/* Primary Commute Badge */}
              <div
                className={`shrink-0 rounded-lg border px-2.5 py-1 text-right ${commuteTone}`}
              >
                <div className="tabular-nums font-ui text-[15px] font-bold leading-none">
                  {hasSecondDest && strategy === 'fairness' ? `≤ ${listing.primaryCommuteMin}m` : `${listing.primaryCommuteMin} min`}
                </div>
                <div className="mt-0.5 whitespace-nowrap font-ui text-[10px] font-medium opacity-85">
                  {hasSecondDest
                    ? strategy === 'hybrid'
                      ? `Hybrid · ${listing.weeklyCommuteHours}h/wk`
                      : strategy === 'balanced'
                        ? `Avg · Δ ${listing.fairnessDeltaMin ?? 0}m`
                        : listing.fairnessDeltaMin === 0
                          ? 'Equal split'
                          : `Max · Δ ${listing.fairnessDeltaMin}m`
                    : routeA.isDirectWalk
                      ? 'Walk'
                      : routeA.transfers === 0
                        ? 'Direct'
                        : `${routeA.transfers} transfer`}
                </div>
              </div>
            </div>

            {/* Specs Strip */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#5F6866]">
              <span className="font-medium text-[#18211F]">{bedroomsLabel(listing.bedrooms)}</span>
              <span>·</span>
              <span className="tabular-nums">{listing.areaSqm} m²</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Wifi className="h-3 w-3 text-[#284E4C]" />
                {listing.workspaceSpec}
              </span>
            </div>

            {/* Visual Route Breakdown */}
            <div className="mt-2.5">
              {hasSecondDest && routeB ? (
                <div className="space-y-1.5 rounded-lg border border-[#EFEAE0] bg-[#FAF8F2] p-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#284E4C] font-ui text-[9px] font-bold text-white">
                        A
                      </span>
                      <span className="truncate font-medium text-[#18211F]">
                        {routeA.isDirectWalk
                          ? 'Direct walk'
                          : routeA.summaryLines.map((l) => l.shortName).join(' → ')}
                      </span>
                    </div>
                    <span className="tabular-nums shrink-0 font-ui font-semibold text-[#18211F]">
                      {routeA.totalMin} min
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#8A5A12] font-ui text-[9px] font-bold text-white">
                        B
                      </span>
                      <span className="truncate font-medium text-[#18211F]">
                        {routeB.isDirectWalk
                          ? 'Direct walk'
                          : routeB.summaryLines.map((l) => l.shortName).join(' → ')}
                      </span>
                    </div>
                    <span className="tabular-nums shrink-0 font-ui font-semibold text-[#18211F]">
                      {routeB.totalMin} min
                    </span>
                  </div>
                </div>
              ) : (
                <TransitTimeline route={routeA} displayCurrency={displayCurrency} compact />
              )}
            </div>
          </div>

          {/* Footer: Rent + True Monthly Cost + Compare Button */}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-[#EFEAE0] pt-2.5">
            <div className="min-w-0">
              <div className="flex items-baseline gap-1 whitespace-nowrap">
                <span className="tabular-nums font-ui text-[15.5px] font-bold text-[#18211F]">
                  {formatMoney(listing.monthlyRentLocal, listing.baseCurrency, displayCurrency)}
                </span>
                <span className="text-[11px] text-[#6A7270]">/mo · bills incl.</span>
              </div>
              <div className="tabular-nums whitespace-nowrap text-[11px] text-[#5F6866]">
                True cost{' '}
                <span className="font-semibold text-[#284E4C]">
                  {formatMoney(listing.cost.trueMonthlyCashLocal, listing.baseCurrency, displayCurrency)}
                </span>{' '}
                <span className="text-[#7A817F]">
                  ({listing.cost.monthlyPassLocal === 0
                    ? '+0 pass'
                    : `+${formatMoney(listing.cost.monthlyPassLocal, listing.baseCurrency, displayCurrency)} pass`}
                  )
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {listing.cost.hoursSavedVsMedian > 1 && (
                <span className="hidden whitespace-nowrap rounded bg-[#F0F6F2] px-1.5 py-0.5 font-ui text-[10px] font-semibold text-[#1F7A55] 2xl:inline-block">
                  +{listing.cost.hoursSavedVsMedian}h saved/mo
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCompare();
                }}
                className={`inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 font-ui text-[11px] font-medium transition-colors ${
                  isCompared
                    ? 'border-[#284E4C] bg-[#284E4C] text-[#FCFBF7]'
                    : 'border-[#DCD5C6] bg-[#FCFBF7] text-[#4A5452] hover:border-[#284E4C] hover:text-[#284E4C]'
                }`}
              >
                {isCompared ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {isCompared ? 'Pinned' : 'Compare'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
