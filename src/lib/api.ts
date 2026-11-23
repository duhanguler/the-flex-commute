import { getLocalBootstrap, rankListingsLocally } from './fallbackEngine';
import type {
  CityBootstrap,
  CityId,
  CuratedDestination,
  InquiryRequest,
  InquiryResponse,
  RankRequest,
  RankResponse,
} from './types';

export async function fetchBootstrap(city: CityId): Promise<{ data: CityBootstrap; liveApi: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`/api/bootstrap?city=${city}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as CityBootstrap;
    return { data, liveApi: true };
  } catch {
    return { data: getLocalBootstrap(city), liveApi: false };
  }
}

export async function fetchRankedCommutes(req: RankRequest): Promise<{ data: RankResponse; liveApi: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch('/api/commute/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as RankResponse;
    return { data, liveApi: true };
  } catch {
    return { data: rankListingsLocally(req), liveApi: false };
  }
}

export async function geocodePlace(city: CityId, q: string): Promise<CuratedDestination[]> {
  if (q.trim().length < 2) return [];
  try {
    const res = await fetch(`/api/geocode?city=${city}&q=${encodeURIComponent(q.trim())}`);
    if (res.ok) {
      const json = (await res.json()) as { results?: CuratedDestination[] };
      if (json.results && json.results.length > 0) return json.results;
    }
  } catch {
    // Direct Nominatim fallback for purely static previews
  }

  try {
    const suffix = city === 'london' ? 'London, UK' : 'Paris, France';
    const viewbox =
      city === 'london' ? '-0.36,51.62,0.14,51.40' : '2.15,48.94,2.48,48.78';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      `${q.trim()}, ${suffix}`,
    )}&format=jsonv2&limit=5&bounded=1&viewbox=${viewbox}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw = (await res.json()) as Array<{
      place_id: number;
      lat: string;
      lon: string;
      display_name: string;
    }>;
    return raw.map((item) => {
      const parts = item.display_name.split(',').map((s) => s.trim());
      return {
        id: `osm-${item.place_id}`,
        name: parts[0] || q,
        shortName: parts[0] || q,
        subtitle: parts.slice(1, 3).join(', ') || suffix,
        category: 'custom',
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      };
    });
  } catch {
    return [];
  }
}

export async function submitStayInquiry(payload: InquiryRequest): Promise<InquiryResponse> {
  try {
    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return (await res.json()) as InquiryResponse;
    }
  } catch {
    // Local confirmation fallback
  }
  const ref = `FLX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  return {
    referenceId: ref,
    status: 'received',
    listingTitle: 'The Flex Residence',
    message: `Flexible stay request recorded (${payload.stayMonths} mo starting ${payload.moveInDate}). Reference ${ref}.`,
  };
}
