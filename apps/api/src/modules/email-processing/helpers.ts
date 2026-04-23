import { convert } from 'html-to-text';

import { dayjs } from '../../lib/dayjs';
import type { CurrencyCode } from '@ledgerlink/shared';

export function htmlToTextContent(html: string | null | undefined) {
  if (!html) {
    return '';
  }

  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  });
}

export function combineEmailText(bodyText?: string | null, bodyHtml?: string | null) {
  return [bodyText ?? '', htmlToTextContent(bodyHtml)]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractEmailAddress(value?: string | null) {
  if (!value) {
    return null;
  }

  const angled = value.match(/<([^>]+)>/);
  if (angled?.[1]) {
    return angled[1].trim().toLowerCase();
  }

  const plain = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plain?.[0]?.trim().toLowerCase() ?? null;
}

export function extractDomain(value?: string | null) {
  const email = extractEmailAddress(value);
  return email?.split('@')[1] ?? null;
}

export function normalizeComparable(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeDisplayText(value?: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function parseAmountString(rawValue: string) {
  const cleaned = rawValue.replace(/[^\d,.-]/g, '').replace(/[.,-]+$/g, '');
  if (!cleaned) {
    return null;
  }

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const normalized = cleaned
      .replace(decimalSeparator === ',' ? /\./g : /,/g, '')
      .replace(decimalSeparator, '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (lastComma > -1) {
    const normalized =
      cleaned.split(',').at(-1)?.length === 2 ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const normalized = lastDot > -1 && cleaned.split('.').at(-1)?.length !== 2 ? cleaned.replace(/\./g, '') : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractAmountAndCurrency(text: string): {
  amount: number | null;
  currency: CurrencyCode | null;
} {
  const patterns: Array<{ regex: RegExp; currency: CurrencyCode }> = [
    { regex: /(?:USD|US\$|\$)\s*([\d.,]+)/i, currency: 'USD' },
    { regex: /(?:VES|BS\.?|BOL[ÍI]VARES?)\s*([\d.,]+)/i, currency: 'VES' },
    { regex: /([\d.,]+)\s*(USD|US\$)/i, currency: 'USD' },
    { regex: /([\d.,]+)\s*(VES|BS\.?|BOL[ÍI]VARES?)/i, currency: 'VES' },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    const rawAmount = match?.[1];
    if (!rawAmount) {
      continue;
    }

    const amount = parseAmountString(rawAmount);
    if (amount !== null) {
      return {
        amount,
        currency: pattern.currency,
      };
    }
  }

  const bareAmount = text.match(/monto[:\s]*([\d.,]+)/i)?.[1];
  return {
    amount: bareAmount ? parseAmountString(bareAmount) : null,
    currency: null,
  };
}

export function extractReference(text: string) {
  const patterns = [
    /(?:referencia|ref\.?|nro\.?\s*de\s*referencia|n[úu]mero\s*de\s*referencia)[:#\s-]*([A-Z0-9-]{5,})/i,
    /(?:operaci[oó]n|transacci[oó]n|confirmaci[oó]n)[:#\s-]*([A-Z0-9-]{5,})/i,
    /c[oó]digo[:#\s-]*([A-Z0-9-]{5,})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

export function extractDestinationLast4(text: string) {
  const patterns = [
    /(?:cuenta|cta\.?|terminada en|ultimos 4|finaliza en)[:#\s-]*[*xX-]*?(\d{4})/i,
    /[*xX]{2,}(\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function extractOriginatorName(text: string) {
  const patterns = [
    /notification\s*-\s*([a-záéíóúñ ]{4,}?)\s+sent\s+you\s+\$/i,
    /(?:ordenante|originador|cliente|remitente|beneficiario)[:\s-]*([A-ZÁÉÍÓÚÑ ]{4,})/i,
    /(?:nombre)[:\s-]*([A-ZÁÉÍÓÚÑ ]{4,})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeDisplayText(match[1]);
    }
  }

  return null;
}

export function extractDateTime(text: string) {
  const patterns = [
    /(\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?)/,
    /(\d{2}-\d{2}-\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?)/,
    /(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?)/,
  ];

  const formats = [
    'DD/MM/YYYY HH:mm:ss',
    'DD/MM/YYYY HH:mm',
    'DD-MM-YYYY HH:mm:ss',
    'DD-MM-YYYY HH:mm',
    'YYYY-MM-DD HH:mm:ss',
    'YYYY-MM-DD HH:mm',
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern)?.[1];
    if (!match) {
      continue;
    }

    for (const format of formats) {
      const parsed = dayjs(match, format, true);
      if (parsed.isValid()) {
        return parsed.toDate();
      }
    }
  }

  return null;
}

export function inferBankName(text: string, fromAddress?: string | null) {
  const source = `${text} ${fromAddress ?? ''}`.toLowerCase();
  if (source.includes('banesco')) {
    return 'Banesco';
  }
  if (source.includes('mercantil')) {
    return 'Mercantil Banco';
  }
  if (source.includes('bancodevenezuela') || source.includes('banco de venezuela')) {
    return 'Banco de Venezuela';
  }

  return null;
}

export function isPublicMailboxDomain(domain: string | null) {
  if (!domain) {
    return false;
  }

  return ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain);
}
