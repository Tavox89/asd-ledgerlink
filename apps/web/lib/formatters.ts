import dayjs from 'dayjs';
import 'dayjs/locale/es';

dayjs.locale('es');

export function formatDateTime(value?: string | Date | null) {
  if (!value) {
    return 'N/D';
  }

  return dayjs(value).format('DD MMM YYYY, HH:mm');
}

export function formatMoney(amount?: number | null, currency?: string | null) {
  if (amount === null || amount === undefined) {
    return 'N/D';
  }

  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency ?? 'USD',
  }).format(amount);
}
