import { Award, Scale, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { bedroomsLabel, formatMoney } from '../lib/currency';
import type { CurrencyCode, RankedListing } from '../lib/types';

interface AnalyticsModalProps {
  initialTab: 'matrix' | 'compare';
  listings: RankedListing[];
  compareIds: string[];
  displayCurrency: CurrencyCode;
  baseCurrency: CurrencyCode;
  hourlyTimeValueLocal: number;
  onHourlyTimeValueChange: (v: number) => void;
  onToggleCompare: (id: string) => void;
  onSelectListing: (id: string) => void;
  onClose: () => void;
}

export function AnalyticsModal({
  initialTab,
  listings,
  compareIds,
  displayCurrency,
  baseCurrency,
  hourlyTimeValueLocal,
  onHourlyTimeValueChange,
  onToggleCompare,
  onSelectListing,
  onClose,
}: AnalyticsModalProps) {
  const [tab, setTab] = useState<'matrix' | 'compare'>(initialTab);
  const [hoveredDot, setHoveredDot] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const comparedListings = listings.filter((l) => compareIds.includes(l.id));
  const hasSecondDest = (listings[0]?.routes.length ?? 1) > 1;
  const bestValue = [...listings].sort(
    (a, b) => a.cost.effectiveMonthlyCostLocal - b.cost.effectiveMonthlyCostLocal,
  )[0];

  const W = 680;
  const H = 340;
  const padL = 72;
  const padR = 28;
  const padT = 26;
  const padB = 46;

  const times = listings.map((l) => l.primaryCommuteMin);
  const costs = listings.map((l) => l.cost.trueMonthlyCashLocal);
  const minX = Math.max(0, Math.min(...times) - 3);
  const maxX = Math.max(...times) + 4;
  const minY = Math.floor((Math.min(...costs) - 200) / 200) * 200;
  const maxY = Math.ceil((Math.max(...costs) + 200) / 200) * 200;

  const sx = (t: number) => padL + ((t - minX) / Math.max(1, maxX - minX)) * (W - padL - padR);
  const sy = (c: number) => H - padB - ((c - minY) / Math.max(1, maxY - minY)) * (H - padT - padB);

  const paretoPoints = listings
    .filter((l) => l.isParetoOptimal)
    .sort((a, b) => a.primaryCommuteMin - b.primaryCommuteMin);
  const paretoPath = paretoPoints
    .map((l, idx) => `${idx === 0 ? 'M' : 'L'} ${sx(l.primaryCommuteMin)} ${sy(l.cost.trueMonthlyCashLocal)}`)
    .join(' ');

  const hoveredListing = listings.find((l) => l.id === hoveredDot) || bestValue;

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-[#18211F]/40 p-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-[960px] flex-col overflow-hidden rounded-2xl border border-[#DCD5C6] bg-[#FCFBF7] shadow-[0_24px_64px_rgba(24,33,31,0.22)]"
        role="dialog"
        aria-label="Commute Value Matrix and Comparison"
      >
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E0D2] bg-white px-5 py-3.5">
          <div className="inline-flex rounded-lg border border-[#E6E0D2] bg-[#F7F4EC] p-0.5">
            <button
              type="button"
              onClick={() => setTab('matrix')}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 font-ui text-[13px] font-medium transition-colors ${
                tab === 'matrix'
                  ? 'bg-[#284E4C] text-[#FCFBF7]'
                  : 'text-[#4A5452] hover:text-[#18211F]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Rent vs. Commute Pareto Matrix
            </button>
            <button
              type="button"
              onClick={() => setTab('compare')}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 font-ui text-[13px] font-medium transition-colors ${
                tab === 'compare'
                  ? 'bg-[#284E4C] text-[#FCFBF7]'
                  : 'text-[#4A5452] hover:text-[#18211F]'
              }`}
            >
              <Scale className="h-3.5 w-3.5" />
              Side-by-Side Compare ({comparedListings.length}/3)
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-[#5F6866] hover:bg-[#F2EEE3] hover:text-[#18211F]"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'matrix' ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div className="rounded-xl border border-[#E6E0D2] bg-white p-4 lg:col-span-8">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-serif-editorial text-[20px] font-medium text-[#18211F]">
                      True Monthly Cost vs. Door-to-Door Commute
                    </h3>
                    <p className="text-[12px] text-[#5F6866]">
                      Bottom-left is optimal. Dashed curve highlights mathematically Pareto-optimal flats.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 font-ui text-[11px] text-[#5F6866]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#284E4C]" />
                      Pareto Optimal
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full border border-[#8A918F] bg-[#EFEAE0]" />
                      Other Flats
                    </span>
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[500px]">
                    {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                      const val = minY + frac * (maxY - minY);
                      const y = sy(val);
                      return (
                        <g key={frac}>
                          <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#EFEAE0" strokeWidth="1" />
                          <text
                            x={padL - 10}
                            y={y + 4}
                            textAnchor="end"
                            fill="#6A7270"
                            fontSize="11"
                            className="tabular-nums"
                          >
                            {formatMoney(val, baseCurrency, displayCurrency)}
                          </text>
                        </g>
                      );
                    })}

                    {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                      const val = Math.round(minX + frac * (maxX - minX));
                      const x = sx(val);
                      return (
                        <g key={frac}>
                          <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="#EFEAE0" strokeWidth="1" />
                          <text
                            x={x}
                            y={H - padB + 18}
                            textAnchor="middle"
                            fill="#6A7270"
                            fontSize="11"
                            className="tabular-nums"
                          >
                            {val} min
                          </text>
                        </g>
                      );
                    })}

                    <text
                      x={(padL + W - padR) / 2}
                      y={H - 8}
                      textAnchor="middle"
                      fill="#4A5452"
                      fontSize="11"
                      fontWeight="600"
                    >
                      Door-to-Door Commute Time (minutes) →
                    </text>

                    {paretoPoints.length > 1 && (
                      <path
                        d={paretoPath}
                        fill="none"
                        stroke="#284E4C"
                        strokeWidth="1.75"
                        strokeDasharray="5 5"
                        opacity="0.65"
                      />
                    )}

                    {listings.map((l) => {
                      const cx = sx(l.primaryCommuteMin);
                      const cy = sy(l.cost.trueMonthlyCashLocal);
                      const isHov = hoveredDot === l.id;
                      const isBest = bestValue?.id === l.id;
                      return (
                        <g
                          key={l.id}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredDot(l.id)}
                          onMouseLeave={() => setHoveredDot(null)}
                          onClick={() => {
                            onSelectListing(l.id);
                            onClose();
                          }}
                        >
                          {isBest && <circle cx={cx} cy={cy} r={13} fill="#E3C17A" opacity={0.35} />}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isHov ? 8.5 : l.isParetoOptimal ? 6.5 : 5}
                            fill={l.isParetoOptimal ? '#284E4C' : '#E6E0D2'}
                            stroke={isHov ? '#18211F' : l.isParetoOptimal ? '#FCFBF7' : '#7A817F'}
                            strokeWidth={isHov ? 2.5 : 1.5}
                          />
                          {(l.isParetoOptimal || isHov) && (
                            <text
                              x={cx}
                              y={cy - 11}
                              textAnchor="middle"
                              fill="#18211F"
                              fontSize="10"
                              fontWeight="600"
                            >
                              {l.neighborhood.split(' ')[0]}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              <div className="flex flex-col gap-4 lg:col-span-4">
                <div className="rounded-xl border border-[#E6E0D2] bg-[#F7F4EC] p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-ui text-[12px] font-semibold text-[#18211F]">
                      Hourly Time Value
                    </span>
                    <span className="tabular-nums font-ui text-[14px] font-bold text-[#284E4C]">
                      {formatMoney(hourlyTimeValueLocal, baseCurrency, displayCurrency)}/hr
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#5F6866]">
                    Adjust how much an hour saved from commuting is worth to you. Higher values reward central flats; lower values favor Zone 2/3 savings.
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    step={5}
                    value={hourlyTimeValueLocal}
                    onChange={(e) => onHourlyTimeValueChange(Number(e.target.value))}
                    className="mt-3 w-full accent-[#284E4C]"
                  />
                  <div className="mt-1 flex justify-between font-ui text-[10px] text-[#7A817F]">
                    <span>{formatMoney(0, baseCurrency, displayCurrency)} (Budget)</span>
                    <span>{formatMoney(40, baseCurrency, displayCurrency)} (Balanced)</span>
                    <span>{formatMoney(80, baseCurrency, displayCurrency)} (Time-First)</span>
                  </div>
                </div>

                {hoveredListing && (
                  <div className="flex-1 rounded-xl border border-[#284E4C]/30 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded bg-[#E4EDEA] px-2 py-0.5 font-ui text-[10px] font-semibold uppercase tracking-[0.05em] text-[#284E4C]">
                        <Award className="h-3 w-3" />
                        {hoveredDot ? 'Inspected Flat' : 'Top Effective Value'}
                      </span>
                      <span className="tabular-nums font-ui text-[12px] font-bold text-[#284E4C]">
                        {hoveredListing.primaryCommuteMin} min
                      </span>
                    </div>
                    <h4 className="mt-2 font-serif-editorial text-[17px] font-medium text-[#18211F]">
                      {hoveredListing.title}
                    </h4>
                    <p className="text-[12px] text-[#5F6866]">{hoveredListing.neighborhood}</p>

                    <dl className="mt-3 space-y-1.5 border-t border-[#EFEAE0] pt-3 text-[12px]">
                      <div className="flex justify-between">
                        <dt className="text-[#6A7270]">True cash cost (rent + pass)</dt>
                        <dd className="tabular-nums font-semibold text-[#18211F]">
                          {formatMoney(
                            hoveredListing.cost.trueMonthlyCashLocal,
                            hoveredListing.baseCurrency,
                            displayCurrency,
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-[#6A7270]">Monthly transit time</dt>
                        <dd className="tabular-nums font-semibold text-[#18211F]">
                          {hoveredListing.cost.monthlyCommuteHours} hrs
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-[#6A7270]">Effective monthly cost</dt>
                        <dd className="tabular-nums font-bold text-[#284E4C]">
                          {formatMoney(
                            hoveredListing.cost.effectiveMonthlyCostLocal,
                            hoveredListing.baseCurrency,
                            displayCurrency,
                          )}
                        </dd>
                      </div>
                    </dl>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectListing(hoveredListing.id);
                        onClose();
                      }}
                      className="mt-3.5 w-full cursor-pointer rounded-lg bg-[#284E4C] py-2 font-ui text-[12px] font-semibold text-[#FCFBF7] transition-colors hover:bg-[#1D3B39]"
                    >
                      Inspect Full Route &amp; Flat
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : comparedListings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#CFC7B6] bg-white px-6 py-12 text-center">
              <Scale className="mx-auto h-8 w-8 text-[#8A918F]" />
              <h3 className="mt-3 font-serif-editorial text-[20px] font-medium text-[#18211F]">
                No apartments pinned for comparison yet
              </h3>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-[#5F6866]">
                Click <strong>+ Compare</strong> on up to 3 apartments in the ranked list, or quick-pin the top 3 right now.
              </p>
              <button
                type="button"
                onClick={() => listings.slice(0, 3).forEach((l) => onToggleCompare(l.id))}
                className="mt-4 cursor-pointer rounded-lg bg-[#284E4C] px-4 py-2 font-ui text-[12px] font-semibold text-[#FCFBF7] hover:bg-[#1D3B39]"
              >
                Compare Top 3 Ranked Flats
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#E6E0D2]">
                    <th className="w-44 py-3 pr-4 font-ui text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6A7270]">
                      Metric
                    </th>
                    {comparedListings.map((l) => (
                      <th key={l.id} className="w-60 px-3 py-3 align-top">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-ui text-[11px] font-medium text-[#6A7270]">
                              #{l.rank} · {l.neighborhood}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectListing(l.id);
                                onClose();
                              }}
                              className="mt-0.5 cursor-pointer text-left font-serif-editorial text-[16px] font-medium text-[#18211F] hover:text-[#284E4C]"
                            >
                              {l.title}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => onToggleCompare(l.id)}
                            className="cursor-pointer rounded p-1 text-[#8A918F] hover:bg-[#F2EEE3] hover:text-[#B3261E]"
                            title="Remove from comparison"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEAE0]">
                  <tr>
                    <td className="py-2.5 pr-4 font-ui font-medium text-[#5F6866]">
                      {hasSecondDest ? 'Dest A Commute' : 'Commute Time'}
                    </td>
                    {comparedListings.map((l) => (
                      <td key={l.id} className="tabular-nums px-3 py-2.5 font-ui text-[15px] font-bold text-[#284E4C]">
                        {l.routes[0].totalMin} min
                      </td>
                    ))}
                  </tr>
                  {hasSecondDest && (
                    <tr>
                      <td className="py-2.5 pr-4 font-ui font-medium text-[#5F6866]">Dest B Commute</td>
                      {comparedListings.map((l) => (
                        <td key={l.id} className="tabular-nums px-3 py-2.5 font-ui text-[15px] font-bold text-[#8A5A12]">
                          {l.routes[1]?.totalMin ?? '—'} min
                        </td>
                      ))}
                    </tr>
                  )}
                  <tr>
                    <td className="py-2.5 pr-4 font-ui font-medium text-[#5F6866]">Transit Lines</td>
                    {comparedListings.map((l) => (
                      <td key={l.id} className="px-3 py-2.5">
                        <div className="space-y-1">
                          {l.routes.map((r, rIdx) => (
                            <div key={r.destinationId} className="flex flex-wrap items-center gap-1">
                              {hasSecondDest && (
                                <span
                                  className={`flex h-4 w-4 items-center justify-center rounded font-ui text-[9px] font-bold text-white ${
                                    rIdx === 0 ? 'bg-[#284E4C]' : 'bg-[#8A5A12]'
                                  }`}
                                >
                                  {rIdx === 0 ? 'A' : 'B'}
                                </span>
                              )}
                              {r.isDirectWalk ? (
                                <span className="rounded bg-[#EAF4EE] px-2 py-0.5 font-ui text-[11px] font-semibold text-[#1F7A55]">
                                  Direct Walk
                                </span>
                              ) : (
                                r.summaryLines.map((ln, idx) => (
                                  <span
                                    key={`${ln.id}-${idx}`}
                                    style={{ backgroundColor: ln.color, color: ln.textColor }}
                                    className="rounded px-1.5 py-0.5 font-ui text-[11px] font-semibold"
                                  >
                                    {ln.shortName}
                                  </span>
                                ))
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-ui font-medium text-[#5F6866]">Transfers / Walk</td>
                    {comparedListings.map((l) => (
                      <td key={l.id} className="tabular-nums px-3 py-2.5 text-[#18211F]">
                        {l.totalTransfers === 0 ? 'Direct (0)' : `${l.totalTransfers} transfer`} · {l.routes[0].walkMin}m walk
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-ui font-medium text-[#5F6866]">Monthly Rent</td>
                    {comparedListings.map((l) => (
                      <td key={l.id} className="tabular-nums px-3 py-2.5 font-semibold text-[#18211F]">
                        {formatMoney(l.monthlyRentLocal, l.baseCurrency, displayCurrency)}/mo
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-ui font-medium text-[#5F6866]">True Monthly Cost</td>
                    {comparedListings.map((l) => (
                      <td key={l.id} className="tabular-nums px-3 py-2.5 font-bold text-[#284E4C]">
                        {formatMoney(l.cost.trueMonthlyCashLocal, l.baseCurrency, displayCurrency)}/mo
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-ui font-medium text-[#5F6866]">Monthly Transit Hours</td>
                    {comparedListings.map((l) => (
                      <td key={l.id} className="tabular-nums px-3 py-2.5 text-[#18211F]">
                        {l.cost.monthlyCommuteHours} hrs/mo (
                        {l.cost.hoursSavedVsMedian >= 0
                          ? `+${l.cost.hoursSavedVsMedian}h saved`
                          : `${l.cost.hoursSavedVsMedian}h`}
                        )
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-ui font-medium text-[#5F6866]">
                      Effective Cost ({formatMoney(hourlyTimeValueLocal, baseCurrency, displayCurrency)}/h)
                    </td>
                    {comparedListings.map((l) => (
                      <td key={l.id} className="tabular-nums px-3 py-2.5 font-semibold text-[#18211F]">
                        {formatMoney(l.cost.effectiveMonthlyCostLocal, l.baseCurrency, displayCurrency)}/mo
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-ui font-medium text-[#5F6866]">Layout &amp; Workspace</td>
                    {comparedListings.map((l) => (
                      <td key={l.id} className="px-3 py-2.5 text-[#4A5452]">
                        {bedroomsLabel(l.bedrooms)} · {l.areaSqm} m² · {l.workspaceSpec}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
