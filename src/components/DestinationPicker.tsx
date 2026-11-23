import { Building2, GraduationCap, Loader2, MapPin, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { geocodePlace } from '../lib/api';
import type { CityId, CuratedDestination, DestinationInput } from '../lib/types';

interface DestinationPickerProps {
  city: CityId;
  badgeLabel: 'A' | 'B';
  placeholder: string;
  value: DestinationInput;
  curated: CuratedDestination[];
  onChange: (dest: DestinationInput) => void;
  onRemove?: () => void;
  showDaysStepper?: boolean;
  onDaysChange?: (days: number) => void;
}

export function DestinationPicker({
  city,
  badgeLabel,
  placeholder,
  value,
  curated,
  onChange,
  onRemove,
  showDaysStepper,
  onDaysChange,
}: DestinationPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [geoResults, setGeoResults] = useState<CuratedDestination[]>([]);
  const [searching, setSearching] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Always search real London/Paris addresses via Nominatim when query >= 3 chars
  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 3) {
      setGeoResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const res = await geocodePlace(city, trimmed);
      if (!cancelled) {
        setGeoResults(res);
        setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [city, open, query]);

  const filteredCurated = query.trim()
    ? curated.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.shortName.toLowerCase().includes(query.toLowerCase()) ||
          c.subtitle.toLowerCase().includes(query.toLowerCase()),
      )
    : curated;

  const universities = filteredCurated.filter((d) => d.category === 'university');
  const workplaces = filteredCurated.filter((d) => d.category === 'workplace');

  const selectPlace = (d: CuratedDestination) => {
    onChange({
      id: d.id,
      name: d.name,
      shortName: d.shortName,
      subtitle: d.subtitle,
      category: d.category,
      lat: d.lat,
      lng: d.lng,
      daysPerWeek: value.daysPerWeek,
    });
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const first = filteredCurated[0] || geoResults[0];
      if (first) selectPlace(first);
    }
  };

  const badgeStyles =
    badgeLabel === 'A'
      ? 'bg-[#284E4C] text-[#FCFBF7]'
      : 'bg-[#8A5A12] text-[#FCFBF7]';

  return (
    <div ref={wrapperRef} className="relative min-w-0 flex-1">
      <div
        className={`flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 transition-colors ${
          open ? 'border-[#284E4C] ring-2 ring-[#284E4C]/12' : 'border-[#DCD5C6] hover:border-[#B9B09B]'
        }`}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-ui text-[11px] font-bold ${badgeStyles}`}
        >
          {badgeLabel}
        </span>

        {open ? (
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`${value.shortName || value.name} — or type any address...`}
            className="min-w-0 flex-1 bg-transparent font-ui text-[13px] text-[#18211F] outline-none placeholder:text-[#8A918F]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-left"
            title={placeholder}
          >
            <div className="min-w-0">
              <div className="truncate font-ui text-[13px] font-semibold text-[#18211F]">
                {value.shortName || value.name}
              </div>
              {value.subtitle && (
                <div className="hidden truncate text-[11px] text-[#6A7270] sm:block">
                  {value.subtitle}
                </div>
              )}
            </div>
            <Search className="h-3.5 w-3.5 shrink-0 text-[#8A918F]" />
          </button>
        )}

        {showDaysStepper && onDaysChange && (
          <div className="flex shrink-0 items-center gap-0.5 rounded border border-[#E6E0D2] bg-[#F7F4EC] px-1 py-0.5 font-ui text-[11px] text-[#4A5452]">
            <button
              type="button"
              onClick={() => onDaysChange(Math.max(1, value.daysPerWeek - 1))}
              className="cursor-pointer px-1 font-semibold hover:text-[#18211F]"
              aria-label="Decrease days per week"
            >
              −
            </button>
            <span className="tabular-nums px-0.5 font-semibold text-[#18211F]">
              {value.daysPerWeek}d/wk
            </span>
            <button
              type="button"
              onClick={() => onDaysChange(Math.min(7, value.daysPerWeek + 1))}
              className="cursor-pointer px-1 font-semibold hover:text-[#18211F]"
              aria-label="Increase days per week"
            >
              +
            </button>
          </div>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 cursor-pointer rounded p-0.5 text-[#7A817F] hover:bg-[#F2EEE3] hover:text-[#18211F]"
            title="Remove second destination"
            aria-label="Remove second destination"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-[1200] mt-1.5 max-h-[390px] overflow-y-auto rounded-xl border border-[#DCD5C6] bg-[#FCFBF7] p-2 shadow-[0_16px_40px_rgba(24,33,31,0.18)]">
          {query.trim().length >= 3 && (
            <div className="mb-2 border-b border-[#E6E0D2] pb-2">
              <div className="flex items-center justify-between px-2.5 py-1 font-ui text-[10px] font-semibold uppercase tracking-[0.07em] text-[#284E4C]">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" />
                  Live {city === 'london' ? 'London' : 'Paris'} address search
                </span>
                {searching && <Loader2 className="h-3 w-3 animate-spin text-[#284E4C]" />}
              </div>
              {!searching && geoResults.length === 0 && (
                <div className="px-2.5 py-1.5 text-[12px] text-[#6A7270]">
                  No external address hits for &ldquo;{query.trim()}&rdquo; in {city === 'london' ? 'London' : 'Paris'}.
                </div>
              )}
              {geoResults.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => selectPlace(g)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#E4EDEA]/60"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#284E4C]" />
                  <div className="min-w-0">
                    <div className="truncate font-ui text-[13px] font-medium text-[#18211F]">
                      {g.name}
                    </div>
                    <div className="truncate text-[11px] text-[#6A7270]">{g.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {universities.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 font-ui text-[10px] font-semibold uppercase tracking-[0.07em] text-[#6A7270]">
                <GraduationCap className="h-3 w-3 text-[#284E4C]" />
                Universities &amp; Campuses
              </div>
              {universities.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => selectPlace(d)}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                    value.id === d.id
                      ? 'bg-[#E4EDEA] text-[#18211F]'
                      : 'hover:bg-[#F2EEE3]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-ui text-[13px] font-medium text-[#18211F]">
                      {d.name}
                    </div>
                    <div className="truncate text-[11px] text-[#6A7270]">{d.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {workplaces.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 font-ui text-[10px] font-semibold uppercase tracking-[0.07em] text-[#6A7270]">
                <Building2 className="h-3 w-3 text-[#284E4C]" />
                Business &amp; Tech Districts
              </div>
              {workplaces.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => selectPlace(d)}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                    value.id === d.id
                      ? 'bg-[#E4EDEA] text-[#18211F]'
                      : 'hover:bg-[#F2EEE3]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-ui text-[13px] font-medium text-[#18211F]">
                      {d.name}
                    </div>
                    <div className="truncate text-[11px] text-[#6A7270]">{d.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
