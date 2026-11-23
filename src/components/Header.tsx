import { Check, Clock, ExternalLink, Scale, Share2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { CityId, CurrencyCode, TimeWindow } from '../lib/types';

interface HeaderProps {
  city: CityId;
  onCityChange: (city: CityId) => void;
  currency: CurrencyCode;
  onCurrencyChange: (currency: CurrencyCode) => void;
  timeWindow: TimeWindow;
  onTimeWindowChange: (tw: TimeWindow) => void;
  compareCount: number;
  onOpenAnalytics: (tab: 'matrix' | 'compare') => void;
  apiStatus: { liveApi: boolean; computeMs: number; engine: string };
}

function copyTextReliably(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function Header({
  city,
  onCityChange,
  currency,
  onCurrencyChange,
  timeWindow,
  onTimeWindowChange,
  compareCount,
  onOpenAnalytics,
  apiStatus,
}: HeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const ok = await copyTextReliably(window.location.href);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } else {
      window.prompt('Copy this shareable commute search URL:', window.location.href);
    }
  };

  return (
    <header className="relative z-40 h-14 shrink-0 border-b border-[#E6E0D2] bg-[#FCFBF7]/95 backdrop-blur-sm">
      <div className="flex h-full items-center justify-between gap-2 px-3 lg:px-6">
        {/* Left: Authentic The Flex Wordmark + City Switcher */}
        <div className="flex items-center gap-3 lg:gap-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#284E4C] text-[#FCFBF7]">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                <path d="M3 10.5L12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 9.5V20h13V9.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9.5 20v-6h5v6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="leading-none">
              <div className="flex items-baseline gap-1.5">
                <span className="font-ui text-[16px] font-semibold tracking-[-0.02em] text-[#18211F]">
                  the flex.
                </span>
                <span className="hidden rounded bg-[#E4EDEA] px-1.5 py-0.5 font-ui text-[10px] font-semibold uppercase tracking-[0.06em] text-[#284E4C] sm:inline-block">
                  Commute
                </span>
              </div>
              <p className="hidden text-[11px] text-[#6A7270] lg:block">
                Transit-ranked furnished stays
              </p>
            </div>
          </div>

          <div className="hidden h-5 w-px bg-[#E6E0D2] sm:block" />

          {/* City Segmented Switcher */}
          <div
            className="inline-flex rounded-lg border border-[#E6E0D2] bg-[#F7F4EC] p-0.5"
            role="tablist"
            aria-label="City"
          >
            {(['london', 'paris'] as CityId[]).map((c) => {
              const active = city === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onCityChange(c)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 font-ui text-[12.5px] font-medium transition-colors ${
                    active
                      ? 'bg-[#284E4C] text-[#FCFBF7]'
                      : 'text-[#4A5452] hover:text-[#18211F]'
                  }`}
                >
                  {c === 'london' ? 'London' : 'Paris'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Departure Window, Currency, Value Matrix, Compare, Share, API status */}
        <div className="flex items-center gap-1.5 lg:gap-2">
          {/* Peak vs Off-Peak (always visible!) */}
          <div className="inline-flex shrink-0 items-center rounded-lg border border-[#E6E0D2] bg-[#F7F4EC] p-0.5">
            <button
              type="button"
              onClick={() => onTimeWindowChange('peak')}
              className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 font-ui text-[11.5px] font-medium transition-colors ${
                timeWindow === 'peak'
                  ? 'bg-white text-[#18211F] shadow-[0_1px_2px_rgba(24,33,31,0.06)]'
                  : 'text-[#5F6866] hover:text-[#18211F]'
              }`}
              title="08:30 AM Morning Peak — rush-hour crowding & busy interchanges"
            >
              <Clock className="hidden h-3 w-3 text-[#284E4C] lg:block" />
              <span>08:30 Peak</span>
            </button>
            <button
              type="button"
              onClick={() => onTimeWindowChange('off_peak')}
              className={`cursor-pointer whitespace-nowrap rounded-md px-2 py-1 font-ui text-[11.5px] font-medium transition-colors ${
                timeWindow === 'off_peak'
                  ? 'bg-white text-[#18211F] shadow-[0_1px_2px_rgba(24,33,31,0.06)]'
                  : 'text-[#5F6866] hover:text-[#18211F]'
              }`}
              title="11:00 AM Off-Peak — faster interchanges & smooth running"
            >
              <span>11:00 Off-Peak</span>
            </button>
          </div>

          {/* Currency GBP / EUR */}
          <div className="inline-flex rounded-lg border border-[#E6E0D2] bg-[#F7F4EC] p-0.5">
            {(['GBP', 'EUR'] as CurrencyCode[]).map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => onCurrencyChange(cur)}
                className={`cursor-pointer rounded-md px-2 py-1 font-ui text-[12px] font-semibold transition-colors ${
                  currency === cur
                    ? 'bg-white text-[#18211F] shadow-[0_1px_2px_rgba(24,33,31,0.06)]'
                    : 'text-[#5F6866] hover:text-[#18211F]'
                }`}
                aria-label={`Switch currency to ${cur}`}
              >
                {cur === 'GBP' ? '£' : '€'}
              </button>
            ))}
          </div>

          {/* Rent vs Time Value Matrix */}
          <button
            type="button"
            onClick={() => onOpenAnalytics('matrix')}
            className="hidden shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E6E0D2] bg-white px-2.5 py-1.5 font-ui text-[12px] font-medium text-[#18211F] transition-colors hover:border-[#284E4C]/50 hover:bg-[#F7F4EC] lg:inline-flex"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#284E4C]" />
            <span>Value Matrix</span>
          </button>

          {/* Compare Tray */}
          <button
            type="button"
            onClick={() => onOpenAnalytics('compare')}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-ui text-[12px] font-medium transition-colors ${
              compareCount > 0
                ? 'border-[#284E4C] bg-[#284E4C] text-[#FCFBF7] hover:bg-[#1D3B39]'
                : 'border-[#E6E0D2] bg-white text-[#4A5452] hover:border-[#CFC7B6] hover:text-[#18211F]'
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Compare</span>
            {compareCount > 0 && (
              <span className="tabular-nums rounded-full bg-white/20 px-1.5 py-0.2 text-[11px] font-semibold">
                {compareCount}
              </span>
            )}
          </button>

          {/* Share URL */}
          <button
            type="button"
            onClick={handleShare}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-ui text-[12px] font-medium transition-colors ${
              copied
                ? 'border-[#1F7A55] bg-[#EAF4EE] text-[#1F7A55]'
                : 'border-[#E6E0D2] bg-white text-[#4A5452] hover:border-[#CFC7B6] hover:text-[#18211F]'
            }`}
            title="Copy shareable link with current commute search"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Share</span>
              </>
            )}
          </button>

          {/* FastAPI Live Status / Docs link */}
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-lg border border-[#E6E0D2] bg-[#F7F4EC] px-2.5 py-1.5 font-ui text-[11px] font-medium text-[#4A5452] transition-colors hover:border-[#284E4C]/40 hover:text-[#284E4C] xl:inline-flex"
            title={`Backend: ${apiStatus.engine} (${apiStatus.computeMs}ms) — Open FastAPI Swagger docs`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                apiStatus.liveApi ? 'bg-[#1F7A55]' : 'bg-[#8A5A12]'
              }`}
            />
            <span className="tabular-nums">
              {apiStatus.liveApi ? `FastAPI · ${apiStatus.computeMs}ms` : 'Local Graph'}
            </span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        </div>
      </div>
    </header>
  );
}
