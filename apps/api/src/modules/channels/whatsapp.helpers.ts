import { formatCurrency, type CurrencyCode } from '@ledgerlink/shared';
import type { VerificationReasonCode } from '@ledgerlink/shared';

import { dayjs } from '../../lib/dayjs';
import {
  extractAmountAndCurrency,
  extractReference,
  inferBankName,
  normalizeDisplayText,
  parseAmountString,
} from '../email-processing/helpers';

export interface TwilioWebhookPayload {
  From?: string;
  To?: string;
  Body?: string;
  MessageSid?: string;
  NumMedia?: string;
  [key: string]: string | undefined;
}

export interface WhatsAppMediaAttachment {
  index: number;
  contentType: string | null;
  url: string | null;
}

export interface TextExtractionResult {
  reference: string | null;
  customerName: string | null;
  alias: string | null;
  amount: number | null;
  currency: CurrencyCode | null;
  bank: string | null;
  originBank: string | null;
  destinationBank: string | null;
  clientId: string | null;
  phoneNumber: string | null;
  date: string | null;
  time: string | null;
  confidence: number;
  rawText: string;
}

export interface VisionExtractionResult {
  isTransferProof: boolean;
  reference: string | null;
  customerName: string | null;
  alias?: string | null;
  amount: number | null;
  currency: CurrencyCode | null;
  date: string | null;
  time: string | null;
  bank: string | null;
  originBank?: string | null;
  destinationBank?: string | null;
  clientId?: string | null;
  phoneNumber?: string | null;
  confidence: number;
  rawText?: string;
  failureReason?: 'invalid_json' | 'not_transfer_proof' | 'download_failed' | 'unknown';
}

export interface CollectedVerificationInput {
  reference: string | null;
  customerName: string | null;
  alias: string | null;
  amount: number | null;
  currency: CurrencyCode;
  currencySource: 'text' | 'image' | 'state' | 'default';
  bank: string | null;
  originBank: string | null;
  destinationBank: string | null;
  clientId: string | null;
  phoneNumber: string | null;
  extractedDate: string | null;
  extractedTime: string | null;
}

export type VerificationPaymentMethod = 'zelle' | 'binance' | 'pago_movil' | 'transferencia_directa' | 'unknown';

export interface VerificationStrategyInput {
  code: 'verification_moment' | 'current_date_day' | 'extracted_datetime' | 'extracted_date_day';
  label: string;
  fechaOperacion: string;
  toleranciaMinutos: number;
}

const monthIndexByName: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

function zeroPad(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeCurrency(value?: string | null): CurrencyCode | null {
  const normalized = (value ?? '').trim().toUpperCase();
  if (
    normalized === 'USD' ||
    normalized === 'VES' ||
    normalized === 'EUR' ||
    normalized === 'COP'
  ) {
    return normalized;
  }

  if (normalized === 'USDT') {
    return 'USD';
  }

  if (normalized === 'US$' || normalized === '$') {
    return 'USD';
  }
  if (normalized === 'BS' || normalized === 'BS.' || normalized === 'BOLIVARES' || normalized === 'BOLÍVARES') {
    return 'VES';
  }

  return null;
}

function extractStructuredAmount(text: string) {
  const labeledPattern =
    /monto[:\s-]*(?:(USD|US\$|\$|USDT|VES|BS\.?|BOL[ÍI]VARES?|EUR|COP)\s*)?([\d.,]+)(?:\s*(USD|US\$|\$|USDT|VES|BS\.?|BOL[ÍI]VARES?|EUR|COP))?/i;
  const labeledMatch = text.match(labeledPattern);
  if (labeledMatch) {
    const [, leadingCurrency, rawAmount, trailingCurrency] = labeledMatch;
    return {
      amount: parseAmountString(rawAmount) ?? null,
      currency: normalizeCurrency(leadingCurrency ?? trailingCurrency ?? null),
    };
  }

  return extractAmountAndCurrency(text);
}

function cleanCustomerName(value: string) {
  return normalizeDisplayText(value)
    .replace(/[.,;:]+$/g, '')
    .replace(/\s+\b(?:from|checking|savings|today|fecha|date|monto|amount|referencia|ref)\b.*$/i, '')
    .trim();
}

function extractAlias(text: string) {
  const match = text.match(/alias[:\s-]*([A-Za-zÁÉÍÓÚÑáéíóúñ0-9_.-]{2,})/i);
  return match?.[1] ? normalizeDisplayText(match[1]).replace(/[.,;:]+$/g, '') : null;
}

function extractClientId(text: string) {
  const match = text.match(/\b(?:cedula|c[eé]dula|rif|ci|documento|identificaci[oó]n)\b[:\s-]*([VEJPGvejpg]?\d{5,12})/i);
  return match?.[1] ? match[1].toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
}

function extractPhoneNumber(text: string) {
  const match = text.match(/\b(?:telefono|tel[eé]fono|phone|celular|tlf)\b[:\s-]*(\+?\d[\d\s().-]{8,})/i);
  if (!match?.[1]) {
    return null;
  }

  const normalized = match[1].replace(/[^\d+]/g, '');
  return normalized || null;
}

function extractBankCode(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[^0-9]{0,20}(\\d{4})`, 'i');
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function extractProviderBanks(text: string) {
  const originBank = extractBankCode(text, [
    'banco\\s+origen',
    'origen',
    'banco\\s+emisor',
    'emisor',
    'desde\\s+el\\s+banco',
  ]);
  const destinationBank = extractBankCode(text, [
    'banco\\s+destino',
    'destino',
    'banco\\s+receptor',
    'receptor',
    'receipt\\s*bank',
  ]);

  return {
    originBank,
    destinationBank,
  };
}

function extractCustomerName(text: string) {
  const patterns = [
    /enrolled as\s*[:-]?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ.'-]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ.'-]+){0,5})(?=\s+(?:from|send date|fecha|date|monto|amount|today|checking|savings|referencia|ref)\b|$)/i,
    /(?:to|para)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ.'-]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ.'-]+){0,5})(?=\s+(?:enrolled as|from|send date|fecha|date|monto|amount|today|checking|savings|referencia|ref)\b|$)/i,
    /(?:nombre|ordenante|originador|cliente|remitente|beneficiario)\s*[:-]?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ.'-]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ.'-]+){0,5})(?=\s+(?:monto|amount|fecha|date|banco|bank|referencia|ref|notas?|notes?)\b|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return cleanCustomerName(match[1]);
    }
  }

  return null;
}

function sanitizeCustomerName(value?: string | null) {
  const normalized = normalizeDisplayText(value);
  if (!normalized) {
    return null;
  }

  if (/[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\s*\.\s*[A-Z]{2,}/i.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeWhatsAppPhone(value?: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/^whatsapp:/i, '')
    .replace(/[^\d+]/g, '')
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}

export function parseAllowedTestNumbers(value: string) {
  return value
    .split(',')
    .map((item) => normalizeWhatsAppPhone(item))
    .filter((item): item is string => Boolean(item));
}

export function parseTwilioMedia(payload: TwilioWebhookPayload): WhatsAppMediaAttachment[] {
  const numMedia = Number(payload.NumMedia ?? '0');
  if (!Number.isFinite(numMedia) || numMedia <= 0) {
    return [];
  }

  return Array.from({ length: numMedia }, (_, index) => ({
    index,
    contentType: payload[`MediaContentType${index}`] ?? null,
    url: payload[`MediaUrl${index}`] ?? null,
  }));
}

export function findFirstImageAttachment(media: WhatsAppMediaAttachment[]) {
  return media.find((item) => item.contentType?.startsWith('image/'));
}

function normalizeMeridiemTime(rawTime: string, meridiem?: string | null) {
  const [rawHours, rawMinutes] = rawTime.split(':');
  const minutes = Number(rawMinutes);
  let hours = Number(rawHours);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  const normalizedMeridiem = meridiem?.toLowerCase() ?? null;
  if (normalizedMeridiem === 'pm' && hours < 12) {
    hours += 12;
  }
  if (normalizedMeridiem === 'am' && hours === 12) {
    hours = 0;
  }

  return `${zeroPad(hours)}:${zeroPad(minutes)}`;
}

function buildIsoDate(year: number, monthIndex: number, day: number) {
  return `${year}-${zeroPad(monthIndex + 1)}-${zeroPad(day)}`;
}

export function extractDateCandidate(text: string, referenceDate: Date = new Date()) {
  const normalized = text.trim();
  if (!normalized) {
    return { date: null, time: null };
  }

  const slashMatch = normalized.match(
    /(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[,\s]+(\d{1,2}:\d{2})(?:\s*(am|pm))?)?/i,
  );
  if (slashMatch) {
    const [, rawDay, rawMonth, rawYear, rawTime, meridiem] = slashMatch;
    return {
      date: buildIsoDate(Number(rawYear), Number(rawMonth) - 1, Number(rawDay)),
      time: rawTime ? normalizeMeridiemTime(rawTime, meridiem) : null,
    };
  }

  const isoMatch = normalized.match(
    /(\d{4})-(\d{2})-(\d{2})(?:[T\s,]+(\d{1,2}:\d{2})(?:\s*(am|pm))?)?/i,
  );
  if (isoMatch) {
    const [, rawYear, rawMonth, rawDay, rawTime, meridiem] = isoMatch;
    return {
      date: buildIsoDate(Number(rawYear), Number(rawMonth) - 1, Number(rawDay)),
      time: rawTime ? normalizeMeridiemTime(rawTime, meridiem) : null,
    };
  }

  const naturalMatch = normalized.match(
    /(\d{1,2})(?:\s+de)?\s+([a-záéíóú]+)(?:\s+de)?\s+(\d{4})(?:[,\s]+(?:a\s+las\s+)?(\d{1,2}:\d{2})(?:\s*(am|pm))?)?/i,
  );
  if (naturalMatch) {
    const [, rawDay, rawMonthName, rawYear, rawTime, meridiem] = naturalMatch;
    const monthIndex =
      monthIndexByName[
        rawMonthName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
      ];
    if (monthIndex !== undefined) {
      return {
        date: buildIsoDate(Number(rawYear), monthIndex, Number(rawDay)),
        time: rawTime ? normalizeMeridiemTime(rawTime, meridiem) : null,
      };
    }
  }

  const relativeMatch = normalized.match(
    /\b(today|hoy|yesterday|ayer)\b(?:[,\s]+(?:at|a\s+las)?\s*(\d{1,2}:\d{2})(?:\s*(am|pm))?)?/i,
  );
  if (relativeMatch) {
    const [, relativeDay, rawTime, meridiem] = relativeMatch;
    const baseDate =
      /yesterday|ayer/i.test(relativeDay)
        ? dayjs(referenceDate).subtract(1, 'day')
        : dayjs(referenceDate);

    return {
      date: baseDate.format('YYYY-MM-DD'),
      time: rawTime ? normalizeMeridiemTime(rawTime, meridiem) : null,
    };
  }

  return {
    date: null,
    time: null,
  };
}

export function extractVerificationFromText(
  text: string | null | undefined,
  referenceDate: Date = new Date(),
): TextExtractionResult {
  const normalizedText = normalizeDisplayText(text);
  if (!normalizedText) {
    return {
      reference: null,
      customerName: null,
      alias: null,
      amount: null,
      currency: null,
      bank: null,
      originBank: null,
      destinationBank: null,
      clientId: null,
      phoneNumber: null,
      date: null,
      time: null,
      confidence: 0,
      rawText: '',
    };
  }

  const amountSnapshot = extractStructuredAmount(normalizedText);
  const { date, time } = extractDateCandidate(normalizedText, referenceDate);
  const customerName = extractCustomerName(normalizedText);
  const alias = extractAlias(normalizedText);
  const providerBanks = extractProviderBanks(normalizedText);
  const clientId = extractClientId(normalizedText);
  const phoneNumber = extractPhoneNumber(normalizedText);

  let confidence = 20;
  if (amountSnapshot.amount !== null) confidence += 20;
  if (extractReference(normalizedText)) confidence += 20;
  if (customerName) confidence += 10;
  if (clientId) confidence += 10;
  if (phoneNumber) confidence += 10;
  if (providerBanks.originBank || providerBanks.destinationBank) confidence += 5;
  if (date) confidence += 10;
  if (time) confidence += 5;
  if (inferBankName(normalizedText, null)) confidence += 5;

  return {
    reference: extractReference(normalizedText),
    customerName,
    alias,
    amount: amountSnapshot.amount,
    currency: amountSnapshot.currency,
    bank: inferBankName(normalizedText, null),
    originBank: providerBanks.originBank,
    destinationBank: providerBanks.destinationBank,
    clientId,
    phoneNumber,
    date,
    time,
    confidence,
    rawText: normalizedText,
  };
}

export function mergeCollectedVerificationInput(
  existingState: Partial<CollectedVerificationInput> | null | undefined,
  textExtraction: TextExtractionResult,
  imageExtraction: VisionExtractionResult | null,
): CollectedVerificationInput {
  const imageFields = imageExtraction?.isTransferProof ? imageExtraction : null;

  const reference =
    textExtraction.reference ??
    imageFields?.reference ??
    existingState?.reference ??
    null;

  const customerName = sanitizeCustomerName(
    textExtraction.customerName ??
      imageFields?.customerName ??
      existingState?.customerName ??
      null,
  );

  const alias =
    textExtraction.alias ??
    imageFields?.alias ??
    existingState?.alias ??
    null;

  const amount =
    textExtraction.amount ??
    imageFields?.amount ??
    existingState?.amount ??
    null;

  const explicitCurrency =
    textExtraction.currency ??
    imageFields?.currency ??
    normalizeCurrency(existingState?.currency) ??
    null;

  const extractedDate =
    textExtraction.date ??
    imageFields?.date ??
    existingState?.extractedDate ??
    null;

  const extractedTime =
    textExtraction.time ??
    imageFields?.time ??
    existingState?.extractedTime ??
    null;

  const bank =
    textExtraction.bank ??
    imageFields?.bank ??
    existingState?.bank ??
    null;

  const originBank =
    textExtraction.originBank ??
    imageFields?.originBank ??
    existingState?.originBank ??
    null;

  const destinationBank =
    textExtraction.destinationBank ??
    imageFields?.destinationBank ??
    existingState?.destinationBank ??
    null;

  const clientId =
    textExtraction.clientId ??
    imageFields?.clientId ??
    existingState?.clientId ??
    null;

  const phoneNumber =
    textExtraction.phoneNumber ??
    imageFields?.phoneNumber ??
    existingState?.phoneNumber ??
    null;

  let currencySource: CollectedVerificationInput['currencySource'] = 'default';
  if (textExtraction.currency) {
    currencySource = 'text';
  } else if (imageFields?.currency) {
    currencySource = 'image';
  } else if (normalizeCurrency(existingState?.currency)) {
    currencySource = 'state';
  }

  return {
    reference,
    customerName,
    alias,
    amount,
    currency: explicitCurrency ?? 'USD',
    currencySource,
    bank,
    originBank,
    destinationBank,
    clientId,
    phoneNumber,
    extractedDate,
    extractedTime,
  };
}

export function detectVerificationMethod(input: {
  textExtraction: TextExtractionResult;
  imageExtraction: VisionExtractionResult | null;
  mergedInput: CollectedVerificationInput;
}): VerificationPaymentMethod {
  const bankSignal = normalizeDisplayText(
    [
      input.textExtraction.bank,
      input.imageExtraction?.bank,
      input.mergedInput.bank,
    ]
      .filter(Boolean)
      .join(' '),
  ).toLowerCase();
  const rawSignal = normalizeDisplayText(
    [
      input.textExtraction.rawText,
      input.imageExtraction?.rawText,
      input.mergedInput.alias,
      input.imageExtraction?.alias,
      input.textExtraction.clientId,
      input.textExtraction.phoneNumber,
      input.imageExtraction?.clientId,
      input.imageExtraction?.phoneNumber,
    ]
      .filter(Boolean)
      .join(' '),
  ).toLowerCase();

  if (
    bankSignal.includes('binance') ||
    /\bbinance\b|\busdt\b|\border\s*id\b|\bid\s*de\s*orden\b|\bcuenta\s*spot\b|\balias\b/i.test(
      rawSignal,
    )
  ) {
    return 'binance';
  }

  if (/\bpago\s*m[oó]vil\b|\bp2p\b/i.test(rawSignal)) {
    return 'pago_movil';
  }

  if (
    /\btransferencia\s+directa\b|\btransferencia\b|\bbanco\s+origen\b|\bbanco\s+destino\b|\bp2c\b/i.test(rawSignal)
  ) {
    return 'transferencia_directa';
  }

  if (/\btelefono\b|\btel[eé]fono\b/i.test(rawSignal)) {
    return 'pago_movil';
  }

  if (
    bankSignal.length > 0 ||
    /\bref\b|\breferencia\b|\breference\b|\breference\s*id\b|\benrolled as\b/i.test(rawSignal)
  ) {
    return 'zelle';
  }

  return 'unknown';
}

export function getMissingVerificationFields(
  input: CollectedVerificationInput,
  method: VerificationPaymentMethod = 'zelle',
) {
  const missing: string[] = [];
  if (method === 'pago_movil' || method === 'transferencia_directa') {
    if (!input.reference) {
      missing.push('referencia');
    }
    if (input.amount === null || input.amount === undefined) {
      missing.push('monto');
    }
    if (!input.clientId) {
      missing.push('cedula/RIF');
    }
    if (method === 'pago_movil' && !input.phoneNumber) {
      missing.push('telefono');
    }
    if (!input.originBank) {
      missing.push('banco origen');
    }
    if (!input.destinationBank) {
      missing.push('banco destino');
    }

    return missing;
  }

  if (!input.reference && !input.customerName) {
    missing.push('referencia o nombre');
  }
  if (input.amount === null || input.amount === undefined) {
    missing.push('monto');
  }

  return missing;
}

function buildLocalDate(date: string, time?: string | null) {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = (time ?? '00:00').split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function buildVerificationStrategies(
  input: CollectedVerificationInput,
  verificationMoment: Date,
  method: VerificationPaymentMethod = 'zelle',
): VerificationStrategyInput[] {
  if (method === 'binance' || method === 'pago_movil' || method === 'transferencia_directa') {
    const date = input.extractedDate ?? dayjs(verificationMoment).format('YYYY-MM-DD');

    return [
      {
        code: input.extractedDate ? 'extracted_date_day' : 'current_date_day',
        label: input.extractedDate ? 'dia detectado' : 'dia actual',
        fechaOperacion: buildLocalDate(date, '12:00').toISOString(),
        toleranciaMinutos: 720,
      },
    ];
  }

  const strategies: VerificationStrategyInput[] = [
    {
      code: 'verification_moment',
      label: 'momento de verificacion',
      fechaOperacion: verificationMoment.toISOString(),
      toleranciaMinutos: 180,
    },
  ];

  if (input.extractedDate && input.extractedTime) {
    strategies.push({
      code: 'extracted_datetime',
      label: 'fecha detectada',
      fechaOperacion: buildLocalDate(input.extractedDate, input.extractedTime).toISOString(),
      toleranciaMinutos: 180,
    });
  } else if (input.extractedDate) {
    strategies.push({
      code: 'extracted_date_day',
      label: 'dia detectado',
      fechaOperacion: buildLocalDate(input.extractedDate, '12:00').toISOString(),
      toleranciaMinutos: 720,
    });
  }

  return strategies;
}

function reasonRank(reasonCode: VerificationReasonCode) {
  switch (reasonCode) {
    case 'authorized':
      return 4;
    case 'date':
      return 3;
    case 'amount':
      return 2;
    case 'name':
      return 1;
    case 'reference':
      return 1;
    case 'identity_required':
      return 0;
    default:
      return 0;
  }
}

function strategyRank(strategy: VerificationStrategyInput) {
  switch (strategy.code) {
    case 'extracted_datetime':
      return 2;
    case 'extracted_date_day':
    case 'current_date_day':
      return 1;
    default:
      return 0;
  }
}

export function choosePreferredStrategyResult<
  TResult extends { authorized: boolean; reasonCode: VerificationReasonCode; candidateCount: number },
>(
  results: Array<{ strategy: VerificationStrategyInput; result: TResult }>,
) {
  return [...results].sort((left, right) => {
    if (Number(right.result.authorized) !== Number(left.result.authorized)) {
      return Number(right.result.authorized) - Number(left.result.authorized);
    }

    const rightRank = reasonRank(right.result.reasonCode);
    const leftRank = reasonRank(left.result.reasonCode);
    if (rightRank !== leftRank) {
      return rightRank - leftRank;
    }

    if (right.result.candidateCount !== left.result.candidateCount) {
      return right.result.candidateCount - left.result.candidateCount;
    }

    if (!left.result.authorized && !right.result.authorized) {
      return strategyRank(right.strategy) - strategyRank(left.strategy);
    }

    return 0;
  })[0] ?? null;
}

export function buildMissingFieldsReply(missingFields: string[]) {
  return `Necesito ${missingFields.join(' y ')} para verificar el pago. Puedes enviarme el comprobante o escribir esos datos directamente.`;
}

export function buildUnknownMethodReply() {
  return 'Necesito saber si el pago es Zelle, Binance, Pago Movil o Transferencia, o ver un comprobante mas claro para continuar.';
}

function methodLabel(method: Exclude<VerificationPaymentMethod, 'unknown'>) {
  switch (method) {
    case 'binance':
      return 'Binance';
    case 'pago_movil':
      return 'Pago movil';
    case 'transferencia_directa':
      return 'Transferencia directa';
    default:
      return 'Zelle';
  }
}

interface BlockedReplyOptions {
  binanceApiErrorCode?: string | null;
  paymentProviderApiErrorCode?: string | null;
}

function translateBinanceApiError(errorCode?: string | null) {
  const normalized = (errorCode ?? '').toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('restricted location') || normalized.includes('eligibility')) {
    return 'Binance API rechazo la consulta por restriccion de ubicacion o IP. Valida la IP permitida y los permisos de la API key';
  }

  if (normalized.includes('binance_api_not_configured')) {
    return 'Binance API no esta configurada en el servidor';
  }

  if (normalized.includes('binance_verifier_token_missing')) {
    return 'el verificador local de Binance no tiene token interno configurado';
  }

  if (normalized.includes('binance_verifier_timeout')) {
    return 'el verificador local de Binance no respondio a tiempo';
  }

  if (normalized.includes('binance_verifier')) {
    return 'el verificador local de Binance no pudo completar la consulta';
  }

  return 'Binance API devolvio un error al consultar la operacion';
}

function translatePaymentProviderError(errorCode?: string | null) {
  const normalized = (errorCode ?? '').toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('not_configured')) {
    return 'InstaPago no esta configurado o esta inactivo para esta empresa';
  }

  if (normalized.includes('timeout')) {
    return 'InstaPago no respondio a tiempo';
  }

  if (normalized.includes('required_field_missing')) {
    return 'faltan datos obligatorios para consultar InstaPago';
  }

  return 'InstaPago devolvio un error al consultar el pago';
}

export function translateVerificationReason(
  reasonCode: VerificationReasonCode,
  method: Exclude<VerificationPaymentMethod, 'unknown'> = 'zelle',
  options: BlockedReplyOptions = {},
) {
  if (method === 'binance') {
    const apiErrorReason = translateBinanceApiError(options.binanceApiErrorCode);
    if (apiErrorReason) {
      return apiErrorReason;
    }

    switch (reasonCode) {
      case 'sender':
        return 'el receptor configurado de Binance no coincide o Binance no lo confirmo';
      case 'name':
        return 'el nombre del pagador no coincide con la operacion oficial de Binance';
      case 'reference':
        return 'el ID de orden no coincide con la operacion oficial de Binance';
      case 'amount':
        return 'el monto no coincide con la operacion oficial de Binance';
      case 'date':
        return 'no se encontro la operacion en la fecha consultada. Escribe solo la fecha del pago; no hace falta la hora';
      case 'identity_required':
        return 'se requiere ID de orden o nombre del pagador para consultar Binance';
      default:
        return 'se encontro evidencia exacta en Binance';
    }
  }

  if (method === 'pago_movil' || method === 'transferencia_directa') {
    const providerErrorReason = translatePaymentProviderError(options.paymentProviderApiErrorCode);
    if (providerErrorReason) {
      return providerErrorReason;
    }

    switch (reasonCode) {
      case 'sender':
        return 'el banco origen o destino no coincide con la respuesta oficial';
      case 'name':
        return method === 'pago_movil'
          ? 'la cedula/RIF o el telefono no coincide con el pago oficial'
          : 'la cedula/RIF no coincide con la transferencia oficial';
      case 'reference':
        return 'la referencia no fue confirmada por InstaPago';
      case 'amount':
        return 'el monto no coincide con el pago oficial';
      case 'date':
        return 'no se encontro el pago en la fecha indicada';
      case 'duplicate':
        return 'InstaPago indica que este pago ya fue validado anteriormente';
      case 'provider_error':
        return 'no se pudo completar la consulta oficial con InstaPago';
      default:
        return 'InstaPago confirmo el pago';
    }
  }

  switch (reasonCode) {
    case 'sender':
      return 'el remitente del correo no coincide con una regla permitida';
    case 'name':
      return 'el nombre del pago no coincide con la evidencia encontrada';
    case 'reference':
      return 'la referencia no coincide con la evidencia encontrada';
    case 'amount':
      return 'el monto no coincide con la evidencia encontrada';
    case 'date':
      return 'la fecha probada no cae dentro de la evidencia exacta';
    case 'identity_required':
      return 'se requiere referencia o nombre para buscar evidencia';
    default:
      return 'se encontro evidencia exacta';
  }
}

export function buildAuthorizedReply(
  method: Exclude<VerificationPaymentMethod, 'unknown'>,
  input: CollectedVerificationInput,
  strategyLabel: string,
) {
  return `${methodLabel(method)}.\nSi, pago valido.\nNombre: ${input.customerName ?? 'sin nombre'}\nReferencia: ${input.reference ?? 'sin referencia'}\nMonto: ${formatCurrency(input.amount ?? 0, input.currency)}\nFecha usada: ${strategyLabel}.`;
}

export function buildBlockedReply(
  method: Exclude<VerificationPaymentMethod, 'unknown'>,
  input: CollectedVerificationInput,
  reasonCode: VerificationReasonCode,
  strategyLabel: string,
  options: BlockedReplyOptions = {},
) {
  return `${methodLabel(method)}.\nNo, pago bloqueado.\nNombre: ${input.customerName ?? 'sin nombre'}\nReferencia: ${input.reference ?? 'sin referencia'}\nMonto: ${formatCurrency(input.amount ?? 0, input.currency)}\nFecha usada: ${strategyLabel}\nMotivo: ${translateVerificationReason(reasonCode, method, options)}.`;
}

export function buildUnauthorizedPhoneReply() {
  return 'Este piloto de validacion esta restringido a numeros aprobados.';
}

export function buildUnsupportedMediaReply() {
  return 'En esta prueba solo acepto texto o capturas de pago en imagen.';
}

export function buildImageFallbackReply() {
  return 'Recibi la imagen, pero no pude identificar un comprobante de pago. Enviame referencia o nombre, y monto para continuar.';
}

export function buildTwimlResponse(message?: string | null) {
  if (!message) {
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  }

  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

export function buildVerificationNotes(
  strategy: VerificationStrategyInput,
  method: Exclude<VerificationPaymentMethod, 'unknown'>,
) {
  return `WhatsApp pilot (${method}:${strategy.code})`;
}

export function formatStrategyTimestamp(strategy: VerificationStrategyInput) {
  return dayjs(strategy.fechaOperacion).toISOString();
}
