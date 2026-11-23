import { ArrowUpDown, Plus, RotateCcw, SlidersHorizontal, Users } from 'lucide-react';
import { formatMoney } from '../lib/currency';
import type {
  CityId,
  CurrencyCode,
  CuratedDestination,
  DestinationInput,
  MultiModeStrategy,
  RankFilters,
  SortBy,
} from '../lib/types';
import { DestinationPicker } from './DestinationPicker';

interface CommuteSearchBarProps {
  city: CityId;
  baseCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
  curated: CuratedDestination[];
  destA: DestinationInput;
  destB: DestinationInput | null;
  onDestAChange: (d: DestinationInput) => void;
  onDestBChange: (d: DestinationInput | null) => void;
  onAddDestB: () => void;
  strategy: MultiModeStrategy;
  onStrategyChange: (s: MultiModeStrategy) => void;
  sortBy: SortBy;
  onSortByChange: (s: SortBy) => void;
  filters: RankFilters;
  onFiltersChange: (f: RankFilters) => void;
}

export function CommuteSearchBar({
  city,
  baseCurrency,
  displayCurrency,
  curated,
  destA,
  destB,
  onDestAChange,
  onDestBChange,
  onAddDestB,
  strategy,
  onStrategyChange,
  sortBy,
  onSortByChange,
  filters,
  onFiltersChange,
}: CommuteSearchBarProps) {
  const hasActiveFilters =
    filters.maxCommuteMin !== null ||
    filters.maxTransfers !== null ||
    filters.bedrooms !== null ||
    filters.maxRentLocal !== null;

  const rentPresets = baseCurrency === 'GBP' ? [2400, 3000, 3500] : [2100, 2600, 3100];

  const clearFilters = () =>
    onFiltersChange({
      maxCommuteMin: null,
      maxTransfers: null,
      bedrooms: null,
      maxRentLocal: null,
    });

  return (
    <section className="relative z-30 shrink-0 border-b border-[#E6E0D2] bg-[#F7F4EC] px-3 py-2.5 lg:px-6">
      {/* Row 1: Destination A (+ optional Destination B for Partner / Hybrid Commute) */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <DestinationPicker
            city={city}
            badgeLabel="A"
            placeholder={`Search ${city === 'london' ? 'London' : 'Paris'} workplace, university, or postcode...`}
            value={destA}
            curated={curated}
            onChange={onDestAChange}
            showDaysStepper={Boolean(destB && strategy === 'hybrid')}
            onDaysChange={(days) => onDestAChange({ ...destA, daysPerWeek: days })}
          />

          {destB ? (
            <DestinationPicker
              city={city}
              badgeLabel="B"
              placeholder="Search partner's office or 2nd campus..."
              value={destB}
              curated={curated}
              onChange={(d) => onDestBChange(d)}
              onRemove={() => onDestBChange(null)}
              showDaysStepper={strategy === 'hybrid'}
              onDaysChange={(days) => onDestBChange({ ...destB, daysPerWeek: days })}
            />
          ) : (
            <button
              type="button"
              onClick={onAddDestB}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#B9B09B] bg-[#FCFBF7] px-3 py-2 font-ui text-[12px] font-medium text-[#284E4C] transition-colors hover:border-[#284E4C] hover:bg-[#E4EDEA]/55"
              title="Compare commutes for couples, flatmates, or hybrid office + campus schedules"
            >
              <Plus className="h-3.5 w-3.5" />
              <Users className="h-3.5 w-3.5" />
              <span>Add 2nd destination</span>
            </button>
          )}
        </div>

        {/* Multi-destination optimization selector */}
        {destB && (
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-[#DCD5C6] bg-[#FCFBF7] p-0.5">
            {(
              [
                { id: 'fairness', label: 'Fairness (Min-Max)', tip: 'Minimizes the longest of the two commutes' },
                { id: 'balanced', label: 'Avg Time', tip: 'Minimizes average daily commute across A & B' },
                { id: 'hybrid', label: 'Hybrid Days', tip: 'Weights A & B by your weekly days' },
              ] as { id: MultiModeStrategy; label: string; tip: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                title={opt.tip}
                onClick={() => onStrategyChange(opt.id)}
                className={`cursor-pointer rounded-md px-2.5 py-1 font-ui text-[11px] font-medium transition-colors ${
                  strategy === opt.id
                    ? 'bg-[#284E4C] text-[#FCFBF7]'
                    : 'text-[#5F6866] hover:text-[#18211F]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Row 2: Compact Commute & Apartment Filters + Sort */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 hidden items-center gap-1 font-ui text-[11px] font-medium text-[#6A7270] sm:inline-flex">
            <SlidersHorizontal className="h-3 w-3" />
            Filters:
          </span>

          {/* Max Commute */}
          <select
            aria-label="Max commute time"
            value={filters.maxCommuteMin ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                maxCommuteMin: e.target.value ? Number(e.target.value) : null,
              })
            }
            className={`cursor-pointer rounded-md border px-2 py-1 font-ui text-[12px] font-medium outline-none transition-colors ${
              filters.maxCommuteMin !== null
                ? 'border-[#284E4C] bg-[#E4EDEA] text-[#18211F]'
                : 'border-[#DCD5C6] bg-white text-[#4A5452] hover:border-[#B9B09B]'
            }`}
          >
            <option value="">Any commute</option>
            <option value="20">≤ 20 min</option>
            <option value="30">≤ 30 min</option>
            <option value="40">≤ 40 min</option>
          </select>

          {/* Max Transfers */}
          <select
            aria-label="Maximum transfers"
            value={filters.maxTransfers ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                maxTransfers: e.target.value !== '' ? Number(e.target.value) : null,
              })
            }
            className={`cursor-pointer rounded-md border px-2 py-1 font-ui text-[12px] font-medium outline-none transition-colors ${
              filters.maxTransfers !== null
                ? 'border-[#284E4C] bg-[#E4EDEA] text-[#18211F]'
                : 'border-[#DCD5C6] bg-white text-[#4A5452] hover:border-[#B9B09B]'
            }`}
          >
            <option value="">Any transfers</option>
            <option value="0">Direct only (0)</option>
            <option value="1">≤ 1 transfer</option>
          </select>

          {/* Bedrooms */}
          <select
            aria-label="Bedrooms"
            value={filters.bedrooms ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                bedrooms: e.target.value !== '' ? Number(e.target.value) : null,
              })
            }
            className={`cursor-pointer rounded-md border px-2 py-1 font-ui text-[12px] font-medium outline-none transition-colors ${
              filters.bedrooms !== null
                ? 'border-[#284E4C] bg-[#E4EDEA] text-[#18211F]'
                : 'border-[#DCD5C6] bg-white text-[#4A5452] hover:border-[#B9B09B]'
            }`}
          >
            <option value="">All layouts</option>
            <option value="0">Studio</option>
            <option value="1">1 Bed</option>
            <option value="2">2 Beds</option>
            <option value="3">3 Beds</option>
          </select>

          {/* Max Monthly Budget (dynamically displayed in selected GBP/EUR currency!) */}
          <select
            aria-label="Maximum monthly rent"
            value={filters.maxRentLocal ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                maxRentLocal: e.target.value ? Number(e.target.value) : null,
              })
            }
            className={`cursor-pointer rounded-md border px-2 py-1 font-ui text-[12px] font-medium outline-none transition-colors ${
              filters.maxRentLocal !== null
                ? 'border-[#284E4C] bg-[#E4EDEA] text-[#18211F]'
                : 'border-[#DCD5C6] bg-white text-[#4A5452] hover:border-[#B9B09B]'
            }`}
          >
            <option value="">Any budget ({displayCurrency})</option>
            {rentPresets.map((amt) => (
              <option key={amt} value={amt}>
                ≤ {formatMoney(amt, baseCurrency, displayCurrency)}/mo
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-ui text-[11px] font-medium text-[#8A5A12] hover:bg-[#FBF1DE]"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>

        {/* Sort Order */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-[#6A7270]" />
          <span className="hidden font-ui text-[11px] font-medium text-[#6A7270] sm:inline">
            Rank by:
          </span>
          <select
            aria-label="Sort apartments by"
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortBy)}
            className="cursor-pointer rounded-md border border-[#DCD5C6] bg-white px-2.5 py-1 font-ui text-[12px] font-semibold text-[#18211F] outline-none hover:border-[#284E4C]"
          >
            <option value="commute">Fastest Commute</option>
            <option value="value">Best Value (Rent + Time)</option>
            <option value="true_cost">Lowest True Cost (Rent + Pass)</option>
            <option value="rent">Lowest Monthly Rent</option>
            <option value="transfers">Fewest Transfers</option>
          </select>
        </div>
      </div>
    </section>
  );
}
