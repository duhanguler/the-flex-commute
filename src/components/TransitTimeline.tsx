import { ArrowRight, Footprints } from 'lucide-react';
import { currencySymbol } from '../lib/currency';
import type { CommuteRoute, CurrencyCode } from '../lib/types';

interface TransitTimelineProps {
  route: CommuteRoute;
  displayCurrency?: CurrencyCode;
  compact?: boolean;
}

export function TransitTimeline({
  route,
  displayCurrency = 'GBP',
  compact = false,
}: TransitTimelineProps) {
  if (route.isDirectWalk) {
    const sym = currencySymbol(displayCurrency);
    return (
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg bg-[#F0F6F2] px-2.5 py-1.5 text-[11.5px] text-[#1F7A55]">
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-ui font-semibold">
          <Footprints className="h-3.5 w-3.5 shrink-0" />
          Direct walk
        </span>
        <span className="tabular-nums whitespace-nowrap text-[#4A5452]">
          · {route.totalMin} min door-to-door ({sym}0 pass)
        </span>
      </div>
    );
  }

  const totalDur = Math.max(1, route.legs.reduce((s, l) => s + l.durationMin, 0));

  return (
    <div className="space-y-1.5">
      {/* Proportional route bar */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[#EFEAE0]">
        {route.legs.map((leg, i) => {
          const pct = Math.max(7, (leg.durationMin / totalDur) * 100);
          const bg =
            leg.kind === 'transit'
              ? leg.lineColor || '#284E4C'
              : leg.kind === 'transfer'
                ? '#C9C0AC'
                : '#8A918F';
          return (
            <div
              key={`${leg.kind}-${i}`}
              style={{ width: `${pct}%`, backgroundColor: bg }}
              className="h-full border-r border-white/60 last:border-r-0"
              title={`${leg.kind === 'transit' ? leg.lineName : leg.kind === 'transfer' ? 'Transfer' : 'Walk'}: ${Math.round(leg.durationMin)}m`}
            />
          );
        })}
      </div>

      {/* Crisp leg pills with official TfL / RATP line colors */}
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        {route.legs.map((leg, idx) => {
          const isLast = idx === route.legs.length - 1;
          if (leg.kind === 'walk') {
            return (
              <span key={idx} className="inline-flex items-center gap-1 text-[#5F6866]">
                <span className="inline-flex items-center gap-0.5 rounded bg-[#F2EEE3] px-1.5 py-0.5 font-medium text-[#4A5452]">
                  <Footprints className="h-2.5 w-2.5" />
                  <span className="tabular-nums">{Math.max(1, Math.round(leg.durationMin))}m</span>
                </span>
                {!isLast && <ArrowRight className="h-2.5 w-2.5 text-[#B5AFA2]" />}
              </span>
            );
          }
          if (leg.kind === 'transfer') {
            return (
              <span key={idx} className="inline-flex items-center gap-1 text-[#6A7270]">
                {!compact && (
                  <span className="tabular-nums rounded border border-[#E6E0D2] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#5F6866]">
                    Change {Math.round(leg.durationMin)}m
                  </span>
                )}
                {!isLast && <ArrowRight className="h-2.5 w-2.5 text-[#B5AFA2]" />}
              </span>
            );
          }
          return (
            <span key={idx} className="inline-flex items-center gap-1">
              <span
                style={{
                  backgroundColor: leg.lineColor || '#284E4C',
                  color: leg.lineTextColor || '#FFFFFF',
                }}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-ui text-[11px] font-semibold tracking-[-0.01em]"
              >
                <span>{leg.lineShortName}</span>
                <span className="tabular-nums opacity-85">
                  {leg.stopsCount} {leg.stopsCount === 1 ? 'stop' : 'stops'}
                </span>
              </span>
              {!isLast && <ArrowRight className="h-2.5 w-2.5 text-[#B5AFA2]" />}
            </span>
          );
        })}
      </div>
    </div>
  );
}
