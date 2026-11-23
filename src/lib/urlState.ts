import type {
  CityId,
  CurrencyCode,
  DestinationInput,
  MultiModeStrategy,
  RankFilters,
  SortBy,
  TimeWindow,
} from './types';

export interface UrlSearchSnapshot {
  city: CityId;
  currency: CurrencyCode;
  destAId: string | null;
  customDestA: DestinationInput | null;
  destBId: string | null;
  customDestB: DestinationInput | null;
  timeWindow: TimeWindow;
  strategy: MultiModeStrategy;
  sortBy: SortBy;
  hourlyValue: number;
  filters: RankFilters;
}

export function readUrlState(): Partial<UrlSearchSnapshot> {
  const params = new URLSearchParams(window.location.search);
  const out: Partial<UrlSearchSnapshot> = {};

  const city = params.get('city');
  if (city === 'london' || city === 'paris') out.city = city;

  const cur = params.get('cur');
  if (cur === 'GBP' || cur === 'EUR') out.currency = cur;

  const dest = params.get('dest');
  if (dest === 'custom') {
    const name = params.get('destName');
    const lat = Number(params.get('destLat'));
    const lng = Number(params.get('destLng'));
    if (name && Number.isFinite(lat) && Number.isFinite(lng)) {
      out.customDestA = {
        id: `custom-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        name,
        shortName: name,
        subtitle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        category: 'custom',
        lat,
        lng,
        daysPerWeek: Number(params.get('dA')) || 5,
      };
    }
  } else if (dest) {
    out.destAId = dest;
  }

  const dest2 = params.get('dest2');
  if (dest2 === 'custom') {
    const name = params.get('dest2Name');
    const lat = Number(params.get('dest2Lat'));
    const lng = Number(params.get('dest2Lng'));
    if (name && Number.isFinite(lat) && Number.isFinite(lng)) {
      out.customDestB = {
        id: `custom-${lat.toFixed(4)}-${lng.toFixed(4)}`,
        name,
        shortName: name,
        subtitle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        category: 'custom',
        lat,
        lng,
        daysPerWeek: Number(params.get('dB')) || 2,
      };
    }
  } else if (dest2) {
    out.destBId = dest2;
  }

  const tw = params.get('window');
  if (tw === 'peak' || tw === 'off_peak') out.timeWindow = tw;

  const strat = params.get('mode');
  if (strat === 'fairness' || strat === 'balanced' || strat === 'hybrid') out.strategy = strat;

  const sort = params.get('sort');
  if (sort === 'commute' || sort === 'value' || sort === 'true_cost' || sort === 'rent' || sort === 'transfers') {
    out.sortBy = sort;
  }

  const hv = params.get('hv');
  if (hv && !Number.isNaN(Number(hv))) out.hourlyValue = Math.min(120, Math.max(0, Number(hv)));

  const maxMin = params.get('maxMin');
  const maxTr = params.get('maxTr');
  const beds = params.get('beds');
  const maxRent = params.get('maxRent');
  if (maxMin || maxTr || beds || maxRent) {
    out.filters = {
      maxCommuteMin: maxMin ? Number(maxMin) : null,
      maxTransfers: maxTr ? Number(maxTr) : null,
      bedrooms: beds ? Number(beds) : null,
      maxRentLocal: maxRent ? Number(maxRent) : null,
    };
  }

  return out;
}

export function syncUrlState(state: {
  city: CityId;
  currency: CurrencyCode;
  destA: DestinationInput;
  destB: DestinationInput | null;
  timeWindow: TimeWindow;
  strategy: MultiModeStrategy;
  sortBy: SortBy;
  hourlyValue: number;
  filters: RankFilters;
}) {
  const params = new URLSearchParams();
  params.set('city', state.city);
  params.set('cur', state.currency);

  if (state.destA.category === 'custom' || state.destA.id.startsWith('osm-') || state.destA.id.startsWith('custom-') || state.destA.id.startsWith('pin-')) {
    params.set('dest', 'custom');
    params.set('destName', state.destA.shortName || state.destA.name);
    params.set('destLat', state.destA.lat.toFixed(5));
    params.set('destLng', state.destA.lng.toFixed(5));
  } else {
    params.set('dest', state.destA.id);
  }

  if (state.destB) {
    if (state.destB.category === 'custom' || state.destB.id.startsWith('osm-') || state.destB.id.startsWith('custom-') || state.destB.id.startsWith('pin-')) {
      params.set('dest2', 'custom');
      params.set('dest2Name', state.destB.shortName || state.destB.name);
      params.set('dest2Lat', state.destB.lat.toFixed(5));
      params.set('dest2Lng', state.destB.lng.toFixed(5));
    } else {
      params.set('dest2', state.destB.id);
    }
    params.set('mode', state.strategy);
    if (state.strategy === 'hybrid') {
      params.set('dA', String(state.destA.daysPerWeek));
      params.set('dB', String(state.destB.daysPerWeek));
    }
  }

  if (state.timeWindow !== 'peak') params.set('window', state.timeWindow);
  if (state.sortBy !== 'commute') params.set('sort', state.sortBy);
  if (state.hourlyValue !== 25) params.set('hv', String(state.hourlyValue));
  if (state.filters.maxCommuteMin !== null) params.set('maxMin', String(state.filters.maxCommuteMin));
  if (state.filters.maxTransfers !== null) params.set('maxTr', String(state.filters.maxTransfers));
  if (state.filters.bedrooms !== null) params.set('beds', String(state.filters.bedrooms));
  if (state.filters.maxRentLocal !== null) params.set('maxRent', String(state.filters.maxRentLocal));

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', nextUrl);
}
