import {
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Footprints,
  MapPin,
  Plus,
  Send,
  Star,
  TrainFront,
  Wifi,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { submitStayInquiry } from '../lib/api';
import {
  bedroomsLabel,
  currencySymbol,
  formatMoney,
  formatWalkDistance,
} from '../lib/currency';
import type {
  CurrencyCode,
  InquiryResponse,
  RankedListing,
  TimeWindow,
} from '../lib/types';

interface ListingDetailDrawerProps {
  listing: RankedListing;
  displayCurrency: CurrencyCode;
  timeWindow: TimeWindow;
  hourlyTimeValueLocal: number;
  onHourlyTimeValueChange: (v: number) => void;
  isCompared: boolean;
  onToggleCompare: () => void;
  onClose: () => void;
}

export function ListingDetailDrawer({
  listing,
  displayCurrency,
  timeWindow,
  hourlyTimeValueLocal,
  onHourlyTimeValueChange,
  isCompared,
  onToggleCompare,
  onClose,
}: ListingDetailDrawerProps) {
  const [activeRouteIdx, setActiveRouteIdx] = useState(0);
  const [showInquiry, setShowInquiry] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [moveInDate, setMoveInDate] = useState('2026-12-01');
  const [stayMonths, setStayMonths] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<InquiryResponse | null>(null);
  const inquirySectionRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Reset per-listing state whenever user selects a different apartment
  useEffect(() => {
    setActiveRouteIdx(0);
    setShowInquiry(false);
    setConfirmation(null);
  }, [listing.id]);

  // Reset active route tab if destination count drops from 2 to 1
  useEffect(() => {
    if (activeRouteIdx >= listing.routes.length) {
      setActiveRouteIdx(0);
    }
  }, [activeRouteIdx, listing.routes.length]);

  // Close drawer on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Scroll the inquiry form into view & focus input immediately when opened
  useEffect(() => {
    if (showInquiry) {
      requestAnimationFrame(() => {
        inquirySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nameInputRef.current?.focus();
      });
    }
  }, [showInquiry]);

  const route = listing.routes[activeRouteIdx] || listing.routes[0];

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    setSubmitting(true);
    const res = await submitStayInquiry({
      listingId: listing.id,
      fullName: fullName.trim(),
      email: email.trim(),
      moveInDate,
      stayMonths,
      commuteDestination: listing.routes.map((r) => r.destinationName).join(' + '),
    });
    setConfirmation(res);
    setSubmitting(false);
  };

  return (
    <div
      className="fixed inset-0 z-[1300] flex justify-start bg-[#18211F]/20"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[530px] flex-col border-r border-[#DCD5C6] bg-[#FCFBF7] shadow-[12px_0_40px_rgba(24,33,31,0.18)]"
        role="dialog"
        aria-label={listing.title}
      >
        {/* Sticky Drawer Header */}
        <div className="flex items-center justify-between border-b border-[#E6E0D2] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="tabular-nums rounded-md bg-[#284E4C] px-2 py-0.5 font-ui text-[11px] font-semibold text-[#FCFBF7]">
              Rank #{listing.rank}
            </span>
            <span className="rounded-md bg-[#F2EEE3] px-2 py-0.5 font-ui text-[11px] font-medium text-[#4A5452]">
              {listing.flexTier}
            </span>
            <span className="rounded-md bg-[#F2EEE3] px-2 py-0.5 font-ui text-[11px] font-medium text-[#4A5452]">
              Zone {listing.fareZone}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleCompare}
              className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 font-ui text-[12px] font-medium transition-colors ${
                isCompared
                  ? 'border-[#284E4C] bg-[#284E4C] text-white'
                  : 'border-[#DCD5C6] bg-white text-[#4A5452] hover:border-[#284E4C]'
              }`}
            >
              {isCompared ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {isCompared ? 'Pinned' : 'Compare'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg p-1.5 text-[#5F6866] hover:bg-[#F2EEE3] hover:text-[#18211F]"
              aria-label="Close apartment details"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Dossier Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Hero Photo */}
          <div className="relative h-52 overflow-hidden rounded-xl border border-[#E6E0D2] bg-[#EFEAE0]">
            <img
              src={listing.image}
              alt={listing.title}
              className="h-full w-full object-cover"
            />
            {listing.isParetoOptimal && (
              <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-[#284E4C]/92 px-2.5 py-1 font-ui text-[11px] font-semibold text-[#FCFBF7]">
                <Award className="h-3.5 w-3.5 text-[#E3C17A]" />
                Pareto-Optimal Rent &amp; Commute Trade-off
              </div>
            )}
          </div>

          {/* Editorial Title & Metadata */}
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 text-[12px] text-[#5F6866]">
              <span className="inline-flex items-center gap-1 font-ui font-medium">
                <MapPin className="h-3.5 w-3.5 text-[#284E4C]" />
                {listing.address} · {listing.postcode}
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-[#18211F]">
                <Star className="h-3.5 w-3.5 fill-[#8A5A12] text-[#8A5A12]" />
                <span className="tabular-nums">{listing.rating.toFixed(2)}</span>
                <span className="text-[#7A817F]">({listing.reviewCount})</span>
              </span>
            </div>

            <h2 className="mt-1 font-serif-editorial text-[23px] font-medium leading-tight text-[#18211F]">
              {listing.title}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#4A5452]">
              {listing.description}
            </p>

            <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
              <span className="rounded-md border border-[#E6E0D2] bg-[#F7F4EC] px-2.5 py-1 font-ui font-medium text-[#18211F]">
                {bedroomsLabel(listing.bedrooms)} · {listing.bathrooms} Bath · {listing.areaSqm} m²
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-[#E6E0D2] bg-[#F7F4EC] px-2.5 py-1 font-ui font-medium text-[#18211F]">
                <Wifi className="h-3.5 w-3.5 text-[#284E4C]" />
                {listing.workspaceSpec}
              </span>
              <span className="rounded-md border border-[#CFE2D8] bg-[#EAF4EE] px-2.5 py-1 font-ui font-medium text-[#1F7A55]">
                {listing.availableFrom}
              </span>
            </div>
          </div>

          {/* Section 1: Door-to-Door Step-by-Step Commute Itinerary */}
          <div className="mt-5 rounded-xl border border-[#E6E0D2] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-ui text-[13px] font-semibold uppercase tracking-[0.06em] text-[#6A7270]">
                  Door-to-Door Itinerary
                </h3>
                <p className="mt-0.5 text-[12px] text-[#5F6866]">
                  {timeWindow === 'peak' ? '08:30 AM Morning Peak' : '11:00 AM Off-Peak'} · Includes gate entry &amp; average headway wait
                </p>
              </div>
              <div className="rounded-lg bg-[#E4EDEA] px-3 py-1 text-right">
                <div className="tabular-nums font-ui text-[18px] font-bold leading-none text-[#284E4C]">
                  {route.totalMin} min
                </div>
                <div className="mt-0.5 font-ui text-[10px] font-medium text-[#4A5452]">
                  {route.isDirectWalk
                    ? 'Direct walk'
                    : `${route.walkMin}m walk · ${route.transitMin}m rail · ${route.waitAndTransferMin}m wait`}
                </div>
              </div>
            </div>

            {listing.routes.length > 1 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {listing.routes.map((r, idx) => (
                  <button
                    key={r.destinationId}
                    type="button"
                    onClick={() => setActiveRouteIdx(idx)}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      activeRouteIdx === idx
                        ? 'border-[#284E4C] bg-[#F7F4EC]'
                        : 'border-[#E6E0D2] bg-white hover:border-[#CFC7B6]'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-ui text-[10px] font-bold text-white ${
                          idx === 0 ? 'bg-[#284E4C]' : 'bg-[#8A5A12]'
                        }`}
                      >
                        {idx === 0 ? 'A' : 'B'}
                      </span>
                      <span className="truncate font-ui text-[12px] font-medium text-[#18211F]">
                        {r.destinationName}
                      </span>
                    </div>
                    <span className="tabular-nums ml-2 shrink-0 font-ui text-[12px] font-bold text-[#284E4C]">
                      {r.totalMin}m
                    </span>
                  </button>
                ))}
              </div>
            )}

            <ol className="mt-4 space-y-3">
              {route.legs.map((leg, idx) => (
                <li key={idx} className="relative flex gap-3">
                  {idx < route.legs.length - 1 && (
                    <span
                      className="absolute bottom-[-14px] left-[13px] top-7 w-[2px]"
                      style={{
                        backgroundColor:
                          leg.kind === 'transit' ? leg.lineColor || '#284E4C' : '#DCD5C6',
                      }}
                    />
                  )}

                  <div
                    className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                    style={
                      leg.kind === 'transit'
                        ? {
                            backgroundColor: leg.lineColor || '#284E4C',
                            borderColor: leg.lineColor || '#284E4C',
                            color: leg.lineTextColor || '#FFFFFF',
                          }
                        : {
                            backgroundColor: '#F7F4EC',
                            borderColor: '#DCD5C6',
                            color: '#4A5452',
                          }
                    }
                  >
                    {leg.kind === 'transit' ? (
                      <TrainFront className="h-3.5 w-3.5" />
                    ) : leg.kind === 'transfer' ? (
                      <Clock className="h-3.5 w-3.5" />
                    ) : (
                      <Footprints className="h-3.5 w-3.5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-ui text-[13px] font-semibold text-[#18211F]">
                        {leg.kind === 'transit' ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span
                              style={{
                                backgroundColor: leg.lineColor || '#284E4C',
                                color: leg.lineTextColor || '#FFFFFF',
                              }}
                              className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                            >
                              {leg.lineName}
                            </span>
                            <span>{leg.fromName}</span>
                            <ArrowRight className="h-3 w-3 text-[#8A918F]" />
                            <span>{leg.toName}</span>
                          </span>
                        ) : leg.kind === 'transfer' ? (
                          <span>
                            Interchange at {leg.fromName}
                            {leg.toName !== leg.fromName ? ` → ${leg.toName}` : ''}
                          </span>
                        ) : (
                          <span>
                            Walk from {leg.fromName} to {leg.toName}
                          </span>
                        )}
                      </div>
                      <span className="tabular-nums shrink-0 font-ui text-[12px] font-semibold text-[#284E4C]">
                        {Math.max(1, Math.round(leg.durationMin))} min
                      </span>
                    </div>

                    {leg.kind === 'walk' && leg.distanceMeters && (
                      <p className="mt-0.5 text-[11px] text-[#6A7270]">
                        {formatWalkDistance(leg.distanceMeters)} street walk
                      </p>
                    )}

                    {leg.kind === 'transfer' && (
                      <p className="mt-0.5 text-[11px] text-[#6A7270]">
                        Platform transfer + average line headway wait
                      </p>
                    )}

                    {leg.kind === 'transit' && leg.stopNames.length > 2 && (
                      <p className="mt-1 text-[11px] leading-relaxed text-[#6A7270]">
                        {leg.stopsCount} stops via {leg.stopNames.slice(1, -1).join(' · ')}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Section 2: Rent vs. Commute Time-Value Analyzer */}
          <div className="mt-4 rounded-xl border border-[#E6E0D2] bg-[#F7F4EC] p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-ui text-[13px] font-semibold uppercase tracking-[0.06em] text-[#6A7270]">
                True Monthly Cost &amp; Time Value
              </h3>
              <span className="tabular-nums rounded-md bg-white px-2 py-0.5 font-ui text-[11px] font-semibold text-[#284E4C]">
                Value Score {listing.cost.valueScore}/100
              </span>
            </div>

            <div className="mt-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-[#4A5452]">Furnished rent (all utilities &amp; fibre incl.)</span>
                <span className="tabular-nums font-semibold text-[#18211F]">
                  {formatMoney(listing.cost.monthlyRentLocal, listing.baseCurrency, displayCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#4A5452]">{listing.cost.passLabel}</span>
                <span className="tabular-nums font-semibold text-[#18211F]">
                  {listing.cost.monthlyPassLocal === 0
                    ? `${currencySymbol(displayCurrency)}0`
                    : `+${formatMoney(listing.cost.monthlyPassLocal, listing.baseCurrency, displayCurrency)}`}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-[#DCD5C6] pt-2 font-ui font-semibold">
                <span className="text-[#18211F]">True Monthly Cash Cost</span>
                <span className="tabular-nums text-[15px] text-[#284E4C]">
                  {formatMoney(listing.cost.trueMonthlyCashLocal, listing.baseCurrency, displayCurrency)}
                </span>
              </div>
            </div>

            <div className="mt-3.5 rounded-lg border border-[#E6E0D2] bg-white p-3">
              <div className="flex items-center justify-between text-[12px]">
                <label htmlFor="drawer-hourly-slider" className="font-ui font-medium text-[#4A5452]">
                  Your personal time valuation
                </label>
                <span className="tabular-nums font-ui font-bold text-[#284E4C]">
                  {formatMoney(hourlyTimeValueLocal, listing.baseCurrency, displayCurrency)}/hr
                </span>
              </div>
              <input
                id="drawer-hourly-slider"
                type="range"
                min={0}
                max={80}
                step={5}
                value={hourlyTimeValueLocal}
                onChange={(e) => onHourlyTimeValueChange(Number(e.target.value))}
                className="mt-2 w-full accent-[#284E4C]"
              />
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded bg-[#FAF8F2] p-2">
                  <div className="text-[#6A7270]">Monthly time in transit</div>
                  <div className="tabular-nums mt-0.5 font-ui text-[13px] font-bold text-[#18211F]">
                    {listing.cost.monthlyCommuteHours} hrs/mo
                  </div>
                </div>
                <div className="rounded bg-[#F0F6F2] p-2">
                  <div className="text-[#4A5452]">vs. city median</div>
                  <div className="tabular-nums mt-0.5 font-ui text-[13px] font-bold text-[#1F7A55]">
                    {listing.cost.hoursSavedVsMedian >= 0
                      ? `+${listing.cost.hoursSavedVsMedian} hrs saved`
                      : `${listing.cost.hoursSavedVsMedian} hrs extra`}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-[#EFEAE0] pt-2 text-[12px]">
                <span className="font-ui font-medium text-[#4A5452]">
                  Effective Monthly Cost (Cash + Time)
                </span>
                <span className="tabular-nums font-ui text-[14px] font-bold text-[#18211F]">
                  {formatMoney(listing.cost.effectiveMonthlyCostLocal, listing.baseCurrency, displayCurrency)}
                </span>
              </div>
            </div>
          </div>

          {/* Amenities */}
          <div className="mt-4">
            <h3 className="font-ui text-[12px] font-semibold uppercase tracking-[0.06em] text-[#6A7270]">
              Included in Every Flex Stay
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {listing.amenities.map((a) => (
                <span
                  key={a}
                  className="rounded-md border border-[#E6E0D2] bg-white px-2.5 py-1 text-[12px] text-[#4A5452]"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>

          {/* Flexible Stay Inquiry Form (auto-scrolled into view on click!) */}
          {showInquiry && (
            <div
              ref={inquirySectionRef}
              className="mt-5 rounded-xl border-2 border-[#284E4C]/40 bg-white p-4 shadow-[0_6px_20px_rgba(40,78,76,0.08)]"
            >
              {confirmation ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[#1F7A55]">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-ui text-[14px] font-semibold">
                      Request Logged · {confirmation.referenceId}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#4A5452]">{confirmation.message}</p>
                </div>
              ) : (
                <form onSubmit={handleInquirySubmit} className="space-y-3">
                  <h4 className="font-ui text-[14px] font-semibold text-[#18211F]">
                    Request Flexible Stay / Viewing
                  </h4>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <input
                      ref={nameInputRef}
                      required
                      type="text"
                      placeholder="Full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="rounded-lg border border-[#DCD5C6] bg-[#FCFBF7] px-3 py-2 text-[13px] outline-none focus:border-[#284E4C]"
                    />
                    <input
                      required
                      type="email"
                      placeholder="Work or university email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-lg border border-[#DCD5C6] bg-[#FCFBF7] px-3 py-2 text-[13px] outline-none focus:border-[#284E4C]"
                    />
                    <input
                      required
                      type="date"
                      value={moveInDate}
                      onChange={(e) => setMoveInDate(e.target.value)}
                      className="rounded-lg border border-[#DCD5C6] bg-[#FCFBF7] px-3 py-2 text-[13px] outline-none focus:border-[#284E4C]"
                    />
                    <select
                      value={stayMonths}
                      onChange={(e) => setStayMonths(Number(e.target.value))}
                      className="rounded-lg border border-[#DCD5C6] bg-[#FCFBF7] px-3 py-2 text-[13px] outline-none focus:border-[#284E4C]"
                    >
                      <option value={1}>1 month flexible</option>
                      <option value={3}>3 months</option>
                      <option value={6}>6 months</option>
                      <option value={12}>12 months</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#284E4C] px-4 py-2.5 font-ui text-[13px] font-semibold text-[#FCFBF7] transition-colors hover:bg-[#1D3B39] disabled:opacity-60"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {submitting ? 'Submitting to FastAPI...' : 'Send Flexible Booking Request'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Sticky Drawer Footer CTA */}
        <div className="flex items-center justify-between gap-3 border-t border-[#E6E0D2] bg-white px-5 py-3.5">
          <div>
            <div className="tabular-nums font-ui text-[18px] font-bold text-[#18211F]">
              {formatMoney(listing.monthlyRentLocal, listing.baseCurrency, displayCurrency)}
              <span className="text-[12px] font-normal text-[#6A7270]"> /mo</span>
            </div>
            <div className="text-[11px] text-[#5F6866]">
              Min {listing.minStayDays} nights · All utilities included
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowInquiry((v) => !v)}
            className="cursor-pointer rounded-lg bg-[#284E4C] px-4 py-2.5 font-ui text-[13px] font-semibold text-[#FCFBF7] transition-colors hover:bg-[#1D3B39]"
          >
            {showInquiry ? 'Hide Request Form' : 'Request Flexible Stay'}
          </button>
        </div>
      </div>
    </div>
  );
}
