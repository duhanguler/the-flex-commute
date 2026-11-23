import type { CurrencyCode } from './types';

const GBP_TO_EUR = 1.18;

export function convertAmount(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
): number {
  if (from === to) return amount;
  if (from === 'GBP' && to === 'EUR') return amount * GBP_TO_EUR;
  return amount / GBP_TO_EUR;
}

export function currencySymbol(currency: CurrencyCode): string {
  return currency === 'GBP' ? '£' : '€';
}

export function formatMoney(
  amount: number,
  from: CurrencyCode,
  display: CurrencyCode,
  decimals = 0,
): string {
  const converted = convertAmount(amount, from, display);
  const sym = currencySymbol(display);
  const formatted = converted.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sym}${formatted}`;
}

export function formatCompactPrice(
  amount: number,
  from: CurrencyCode,
  display: CurrencyCode,
): string {
  const converted = convertAmount(amount, from, display);
  const sym = currencySymbol(display);
  if (converted >= 1000) {
    return `${sym}${(converted / 1000).toFixed(1)}k`;
  }
  return `${sym}${Math.round(converted)}`;
}

export function bedroomsLabel(bedrooms: number): string {
  if (bedrooms === 0) return 'Studio';
  if (bedrooms === 1) return '1 Bed';
  return `${bedrooms} Beds`;
}

export function formatWalkDistance(meters?: number | null): string {
  if (!meters) return '';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 10) * 10} m`;
}
