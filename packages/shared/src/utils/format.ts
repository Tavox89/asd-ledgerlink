import type { CurrencyCode } from '../types/domain';

export function formatCurrency(amount: number, currency: CurrencyCode) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VES' ? 2 : 2,
  }).format(amount);
}

export function truncateMiddle(value: string, size = 18) {
  if (value.length <= size) {
    return value;
  }

  const edge = Math.max(4, Math.floor((size - 3) / 2));
  return `${value.slice(0, edge)}...${value.slice(-edge)}`;
}
