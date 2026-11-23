import L from 'leaflet';
import { Crosshair, Layers, LocateFixed, Radar } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCompactPrice } from '../lib/currency';
import type {
  CityId,
  CurrencyCode,
  DestinationInput,
  IsochroneBand,
  NetworkPolyline,
  RankedListing,
} from '../lib/types';

interface CommuteMapProps {
  city: CityId;
  center: [number, number];
  defaultZoom: number;
  destinations: DestinationInput[];
  listings: RankedListing[];
  isochrones: IsochroneBand[];
  networkLines: NetworkPolyline[];
  displayCurrency: CurrencyCode;
  selectedId: string | null;
  hoveredId: string | null;
  onSelectListing: (id: string) => void;
  onHoverListing: (id: string | null) => void;
  onDropPin: (lat: number, lng: number) => void;
}

function buildListingPinIcon(
  listing: RankedListing,
  displayCurrency: CurrencyCode,
  isActive: boolean,
): L.DivIcon {
  const dimmed = !listing.matchesFilters && !isActive;
  const priceLabel = formatCompactPrice(
    listing.monthlyRentLocal,
    listing.baseCurrency,
    displayCurrency,
  );

  const bg = isActive ? '#284E4C' : '#FFFFFF';
  const text = isActive ? '#FCFBF7' : '#18211F';
  const border = isActive ? '#1D3B39' : listing.isParetoOptimal ? '#284E4C' : '#CFC7B6';
  const timeBg = isActive
    ? 'rgba(255,255,255,0.20)'
    : listing.primaryCommuteMin <= 20
      ? '#EAF4EE'
      : '#F2EEE3';
  const timeText = isActive
    ? '#FCFBF7'
    : listing.primaryCommuteMin <= 20
      ? '#1F7A55'
      : '#284E4C';

  return L.divIcon({
    className: 'flex-map-pin',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `
      <div style="
        transform: translate(-50%, -50%) scale(${isActive ? 1.1 : 1});
        transition: transform 120ms ease, background-color 120ms ease;
        opacity: ${dimmed ? 0.42 : 1};
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: ${bg};
        color: ${text};
        border: 1.5px solid ${border};
        border-radius: 999px;
        padding: 2px 6px 2px 3px;
        font-family: 'Instrument Sans', sans-serif;
        font-size: 10.5px;
        font-weight: 600;
        white-space: nowrap;
        box-shadow: ${isActive ? '0 8px 20px rgba(40,78,76,0.34)' : '0 2px 6px rgba(24,33,31,0.12)'};
        cursor: pointer;
      ">
        <span style="
          background: ${timeBg};
          color: ${timeText};
          border-radius: 999px;
          padding: 1px 5px;
          font-variant-numeric: tabular-nums;
          font-weight: 700;
        ">${listing.primaryCommuteMin}m</span>
        <span style="font-variant-numeric: tabular-nums;">${priceLabel}</span>
      </div>
    `,
  });
}

export function CommuteMap({
  city,
  center,
  defaultZoom,
  destinations,
  listings,
  isochrones,
  networkLines,
  displayCurrency,
  selectedId,
  hoveredId,
  onSelectListing,
  onHoverListing,
  onDropPin,
}: CommuteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerMapRef = useRef<Map<string, { marker: L.Marker; listing: RankedListing }>>(new Map());
  const layersRef = useRef<{
    iso45: L.LayerGroup;
    iso30: L.LayerGroup;
    iso15: L.LayerGroup;
    network: L.LayerGroup;
    route: L.LayerGroup;
    markers: L.LayerGroup;
    destinations: L.LayerGroup;
  } | null>(null);

  // Latest callbacks via refs so persistent Leaflet listeners never go stale
  const onSelectRef = useRef(onSelectListing);
  const onHoverRef = useRef(onHoverListing);
  const onDropPinRef = useRef(onDropPin);
  onSelectRef.current = onSelectListing;
  onHoverRef.current = onHoverListing;
  onDropPinRef.current = onDropPin;

  const [showIsochrones, setShowIsochrones] = useState(true);
  const [showNetwork, setShowNetwork] = useState(false);
  const [dropPinMode, setDropPinMode] = useState(false);
  const dropPinModeRef = useRef(false);
  dropPinModeRef.current = dropPinMode;

  // Initialize Leaflet map once + attach ResizeObserver for mobile toggle & split-pane resizes
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center,
      zoom: defaultZoom + 0.3,
      zoomSnap: 0.5,
      zoomControl: false,
      preferCanvas: false,
    });

    // Architectural basemap (Esri World Light Gray — zero API keys, zero clutter)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap',
        maxZoom: 16,
      },
    ).addTo(map);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 16,
        opacity: 0.72,
      },
    ).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const pane45 = map.createPane('iso45');
    pane45.style.zIndex = '240';
    const pane30 = map.createPane('iso30');
    pane30.style.zIndex = '245';
    const pane15 = map.createPane('iso15');
    pane15.style.zIndex = '250';

    const networkPane = map.createPane('networkPane');
    networkPane.style.zIndex = '310';
    const routePane = map.createPane('routePane');
    routePane.style.zIndex = '430';

    layersRef.current = {
      iso45: L.layerGroup().addTo(map),
      iso30: L.layerGroup().addTo(map),
      iso15: L.layerGroup().addTo(map),
      network: L.layerGroup().addTo(map),
      route: L.layerGroup().addTo(map),
      markers: L.layerGroup().addTo(map),
      destinations: L.layerGroup().addTo(map),
    };

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!dropPinModeRef.current) return;
      onDropPinRef.current(e.latlng.lat, e.latlng.lng);
      setDropPinMode(false);
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      if (el.offsetWidth > 0 && el.offsetHeight > 0) {
        map.invalidateSize({ animate: false });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
      markerMapRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center smoothly on city switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(center, defaultZoom + 0.3, { animate: true });
    setDropPinMode(false);
  }, [city, center, defaultZoom]);

  // Gently pan to frame destination changes (without jarring jumps on initial mount)
  const destSig = destinations.map((d) => `${d.id}:${d.lat.toFixed(4)},${d.lng.toFixed(4)}`).join('|');
  const prevDestSigRef = useRef(destSig);
  useEffect(() => {
    if (prevDestSigRef.current === destSig) return;
    prevDestSigRef.current = destSig;
    const map = mapRef.current;
    if (!map || destinations.length === 0) return;

    if (destinations.length === 1) {
      map.panTo([destinations[0].lat, destinations[0].lng], { animate: true, duration: 0.45 });
    } else {
      const bounds = L.latLngBounds(destinations.map((d): [number, number] => [d.lat, d.lng]));
      map.fitBounds(bounds, { padding: [90, 90], maxZoom: 13.5, animate: true });
    }
  }, [destSig, destinations]);

  // Render Isochrones (true station-catchment transit reach zones)
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.iso45.clearLayers();
    layers.iso30.clearLayers();
    layers.iso15.clearLayers();

    if (!showIsochrones) return;

    const bandMap: Record<number, { group: L.LayerGroup; pane: string; fill: string }> = {
      45: { group: layers.iso45, pane: 'iso45', fill: '#6E8C89' },
      30: { group: layers.iso30, pane: 'iso30', fill: '#3B6B68' },
      15: { group: layers.iso15, pane: 'iso15', fill: '#284E4C' },
    };

    for (const band of isochrones) {
      const cfg = bandMap[band.minutes];
      if (!cfg) continue;
      for (const c of band.catchments) {
        L.circle([c.lat, c.lng], {
          pane: cfg.pane,
          radius: c.radiusMeters,
          stroke: false,
          fillColor: cfg.fill,
          fillOpacity: 1.0,
          interactive: false,
        }).addTo(cfg.group);
      }
    }
  }, [isochrones, showIsochrones]);

  // Render optional Transit Network Overlay
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.network.clearLayers();
    if (!showNetwork) return;

    for (const line of networkLines) {
      L.polyline(line.coordinates, {
        pane: 'networkPane',
        color: line.color,
        weight: 2.5,
        opacity: 0.48,
        interactive: false,
      }).addTo(layers.network);
    }
  }, [networkLines, showNetwork]);

  // Render Destination A / B pins
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.destinations.clearLayers();

    destinations.forEach((d, idx) => {
      const letter = idx === 0 ? 'A' : 'B';
      const bg = idx === 0 ? '#284E4C' : '#8A5A12';
      const short = (d.shortName || d.name).slice(0, 22);

      const icon = L.divIcon({
        className: 'flex-map-pin',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        html: `
          <div style="transform: translate(-50%, -100%); display:flex; flex-direction:column; align-items:center; pointer-events:none;">
            <div style="display:inline-flex; align-items:center; gap:6px; background:${bg}; color:#FCFBF7; padding:4px 9px 4px 5px; border-radius:999px; font-family:'Instrument Sans',sans-serif; font-size:11.5px; font-weight:600; white-space:nowrap; box-shadow:0 6px 16px rgba(24,33,31,0.24); border:2px solid #FCFBF7;">
              <span style="display:inline-flex; align-items:center; justify-content:center; width:17px; height:17px; border-radius:999px; background:#FCFBF7; color:${bg}; font-size:10px; font-weight:700;">${letter}</span>
              <span>${short}</span>
            </div>
            <div style="width:2px; height:7px; background:${bg};"></div>
            <div style="width:8px; height:8px; border-radius:999px; background:${bg}; border:2px solid #FCFBF7; box-shadow:0 2px 6px rgba(0,0,0,0.25);"></div>
          </div>
        `,
      });

      L.marker([d.lat, d.lng], { icon, zIndexOffset: 900, interactive: false }).addTo(
        layers.destinations,
      );
    });
  }, [destinations]);

  // 1) Create/sync apartment markers ONLY when listings or displayCurrency change (NEVER on hover!)
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.markers.clearLayers();
    markerMapRef.current.clear();

    for (const listing of listings) {
      const isActive = listing.id === selectedId || listing.id === hoveredId;
      const marker = L.marker([listing.lat, listing.lng], {
        icon: buildListingPinIcon(listing, displayCurrency, isActive),
        zIndexOffset: isActive ? 750 : listing.matchesFilters ? 300 : 100,
      });

      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (dropPinModeRef.current) return;
        onSelectRef.current(listing.id);
      });
      marker.on('mouseover', () => {
        if (!dropPinModeRef.current) onHoverRef.current(listing.id);
      });
      marker.on('mouseout', () => {
        if (!dropPinModeRef.current) onHoverRef.current(null);
      });

      marker.addTo(layers.markers);
      markerMapRef.current.set(listing.id, { marker, listing });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, displayCurrency]);

  // 2) Lightweight icon & zIndex highlight update on hover/select WITHOUT destroying marker DOM nodes!
  const prevActiveRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nextActive = new Set<string>();
    if (selectedId) nextActive.add(selectedId);
    if (hoveredId) nextActive.add(hoveredId);

    const toUpdate = new Set<string>([...prevActiveRef.current, ...nextActive]);
    toUpdate.forEach((id) => {
      const entry = markerMapRef.current.get(id);
      if (!entry) return;
      const isActive = nextActive.has(id);
      entry.marker.setIcon(buildListingPinIcon(entry.listing, displayCurrency, isActive));
      entry.marker.setZIndexOffset(isActive ? 750 : entry.listing.matchesFilters ? 300 : 100);
    });

    prevActiveRef.current = nextActive;
  }, [selectedId, hoveredId, displayCurrency]);

  // Render Multi-Leg Active Route Polyline(s) for selected or hovered apartment
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.route.clearLayers();

    const activeId = hoveredId || selectedId || listings[0]?.id;
    const activeListing = listings.find((l) => l.id === activeId);
    if (!activeListing) return;

    activeListing.routes.forEach((route, routeIdx) => {
      const isSecondary = routeIdx === 1;
      for (const leg of route.legs) {
        if (leg.coordinates.length < 2) continue;

        if (leg.kind === 'walk' || leg.kind === 'transfer') {
          L.polyline(leg.coordinates, {
            pane: 'routePane',
            color: isSecondary ? '#8A5A12' : '#3D4745',
            weight: 3,
            opacity: 0.85,
            dashArray: '4, 7',
            lineCap: 'round',
            interactive: false,
          }).addTo(layers.route);
        } else {
          L.polyline(leg.coordinates, {
            pane: 'routePane',
            color: '#FCFBF7',
            weight: 7.5,
            opacity: 0.92,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false,
          }).addTo(layers.route);

          L.polyline(leg.coordinates, {
            pane: 'routePane',
            color: leg.lineColor || '#284E4C',
            weight: 4.5,
            opacity: 0.98,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: false,
          }).addTo(layers.route);

          leg.coordinates.forEach((coord, idx) => {
            const isEndpoint = idx === 0 || idx === leg.coordinates.length - 1;
            const dot = L.circleMarker(coord, {
              pane: 'routePane',
              radius: isEndpoint ? 5.5 : 3.5,
              color: leg.lineColor || '#284E4C',
              weight: isEndpoint ? 2.5 : 1.5,
              fillColor: '#FCFBF7',
              fillOpacity: 1,
            });
            const stopName = leg.stopNames[idx];
            if (stopName) {
              dot.bindTooltip(
                `${stopName}${isEndpoint ? ` · ${leg.lineShortName}` : ''}`,
                {
                  direction: 'top',
                  offset: [0, -6],
                  className: 'flex-station-tip',
                },
              );
            }
            dot.addTo(layers.route);
          });
        }
      }
    });
  }, [hoveredId, selectedId, listings]);

  const handleFitAll = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts: [number, number][] = [
      ...destinations.map((d): [number, number] => [d.lat, d.lng]),
      ...listings.filter((l) => l.matchesFilters).map((l): [number, number] => [l.lat, l.lng]),
    ];
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [46, 46], maxZoom: 14 });
    } else {
      map.setView(center, defaultZoom + 0.3);
    }
  }, [destinations, listings, center, defaultZoom]);

  const activeListing = listings.find((l) => l.id === (hoveredId || selectedId || listings[0]?.id));
  const iso15 = isochrones.find((b) => b.minutes === 15);
  const iso30 = isochrones.find((b) => b.minutes === 30);
  const iso45 = isochrones.find((b) => b.minutes === 45);
  const hasTwo = destinations.length > 1;

  return (
    <div
      className={`isolate relative z-0 h-full w-full overflow-hidden bg-[#F4F1E8] ${
        dropPinMode ? '[&_.leaflet-container]:!cursor-crosshair' : ''
      }`}
    >
      <div ref={containerRef} className="h-full w-full" />

      {/* Drop Pin Hint Banner */}
      {dropPinMode && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-[520] -translate-x-1/2 rounded-full bg-[#18211F] px-3.5 py-1.5 font-ui text-[12px] font-medium text-[#FCFBF7] shadow-[0_8px_24px_rgba(24,33,31,0.28)]">
          Click anywhere on the {city === 'london' ? 'London' : 'Paris'} map to set Destination {hasTwo ? 'B' : 'A'}
        </div>
      )}

      {/* Top-Right Floating Map Controls */}
      <div className="absolute right-3.5 top-3.5 z-[500] flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setDropPinMode((v) => !v)}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-ui text-[12px] font-medium shadow-[0_2px_10px_rgba(24,33,31,0.08)] backdrop-blur-sm transition-colors ${
            dropPinMode
              ? 'border-[#8A5A12] bg-[#8A5A12] text-[#FCFBF7]'
              : 'border-[#DCD5C6] bg-[#FCFBF7]/95 text-[#4A5452] hover:text-[#18211F]'
          }`}
          title="Click anywhere on the map to set a custom workplace or university pin"
        >
          <Crosshair className="h-3.5 w-3.5" />
          <span>{dropPinMode ? 'Cancel Pin' : 'Pick on Map'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowIsochrones((v) => !v)}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-ui text-[12px] font-medium shadow-[0_2px_10px_rgba(24,33,31,0.08)] backdrop-blur-sm transition-colors ${
            showIsochrones
              ? 'border-[#284E4C] bg-[#284E4C] text-[#FCFBF7]'
              : 'border-[#DCD5C6] bg-[#FCFBF7]/95 text-[#4A5452] hover:text-[#18211F]'
          }`}
        >
          <Radar className="h-3.5 w-3.5" />
          <span>15/30/45m Zones</span>
        </button>

        <button
          type="button"
          onClick={() => setShowNetwork((v) => !v)}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-ui text-[12px] font-medium shadow-[0_2px_10px_rgba(24,33,31,0.08)] backdrop-blur-sm transition-colors ${
            showNetwork
              ? 'border-[#284E4C] bg-[#284E4C] text-[#FCFBF7]'
              : 'border-[#DCD5C6] bg-[#FCFBF7]/95 text-[#4A5452] hover:text-[#18211F]'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>{city === 'london' ? 'TfL Lines' : 'Métro / RER'}</span>
        </button>

        <button
          type="button"
          onClick={handleFitAll}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#DCD5C6] bg-[#FCFBF7]/95 px-2.5 py-1.5 font-ui text-[12px] font-medium text-[#4A5452] shadow-[0_2px_10px_rgba(24,33,31,0.08)] backdrop-blur-sm transition-colors hover:text-[#18211F]"
          title="Fit all matching apartments & destinations"
        >
          <LocateFixed className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Fit All</span>
        </button>
      </div>

      {/* Bottom-Left Floating Isochrone & Active Route Legend */}
      <div className="pointer-events-none absolute bottom-16 left-3.5 z-[500] flex max-w-[350px] flex-col gap-2 min-[900px]:bottom-4">
        {activeListing && (
          <div className="pointer-events-auto rounded-xl border border-[#DCD5C6] bg-[#FCFBF7]/95 px-3 py-2 shadow-[0_6px_20px_rgba(24,33,31,0.10)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.07em] text-[#6A7270]">
                Active Route Preview
              </span>
              <span className="tabular-nums font-ui text-[11px] font-bold text-[#284E4C]">
                {activeListing.primaryCommuteMin} min
              </span>
            </div>
            <div className="mt-0.5 truncate font-ui text-[12px] font-semibold text-[#18211F]">
              {activeListing.neighborhood} → {destinations.map((d) => d.shortName || d.name).join(' & ')}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {activeListing.routes[0].isDirectWalk ? (
                <span className="text-[11px] text-[#1F7A55]">Direct street walk</span>
              ) : (
                activeListing.routes[0].summaryLines.map((ln, idx) => (
                  <span
                    key={`${ln.id}-${idx}`}
                    style={{ backgroundColor: ln.color, color: ln.textColor }}
                    className="rounded px-1.5 py-0.5 font-ui text-[10px] font-semibold"
                  >
                    {ln.shortName} · {ln.stops} {ln.stops === '1' ? 'stop' : 'stops'}
                  </span>
                ))
              )}
            </div>
          </div>
        )}

        {showIsochrones && (
          <div className="pointer-events-auto inline-flex items-center gap-2.5 rounded-lg border border-[#DCD5C6] bg-[#FCFBF7]/95 px-3 py-1.5 font-ui text-[11px] text-[#4A5452] shadow-[0_4px_14px_rgba(24,33,31,0.08)] backdrop-blur-sm">
            <span className="font-semibold text-[#18211F]">
              {hasTwo ? 'Shared Reach:' : 'Transit Reach:'}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[#284E4C]/45" />
              <span className="tabular-nums">
                15m{iso15 ? ` (${iso15.reachableStationsCount})` : ''}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3B6B68]/30" />
              <span className="tabular-nums">
                30m{iso30 ? ` (${iso30.reachableStationsCount})` : ''}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[#6E8C89]/20" />
              <span className="tabular-nums">
                45m{iso45 ? ` (${iso45.reachableStationsCount})` : ''}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
