import crypto from 'node:crypto';

import type { CaptureExtractionInput, CaptureExtractionMethod, CurrencyCode } from '@ledgerlink/shared';

import { dayjs } from '../../lib/dayjs';
import { extractVerificationFromImageDataUri } from '../channels/whatsapp.vision';
import type { VerificationPaymentMethod, VisionExtractionResult } from '../channels/whatsapp.helpers';

type ExtractedFields = {
  reference: string | null;
  payerName: string | null;
  paymentDate: string | null;
  bankOrigin: string | null;
  bankDestination: string | null;
  customerDocument: string | null;
  customerPhone: string | null;
  amount: number | null;
  currency: CurrencyCode | null;
};

export type NormalizedCaptureExtraction = {
  ok: boolean;
  method: CaptureExtractionMethod;
  fields: ExtractedFields;
  confidence: number;
  missingFields: string[];
  warnings: string[];
  amountMatch: boolean | null;
  rawTextPreview: string;
  extractionId: string;
  imageHash: string;
  failureReason?: string;
};

function normalizeMethod(value: string): CaptureExtractionMethod {
  const method = value.trim().toLowerCase().replace(/-/g, '_');
  if (method === 'binance') return 'binance';
  if (method === 'pago_movil' || method === 'pagomovil') return 'pago_movil';
  if (method === 'transferencia' || method === 'transferencia_directa') return 'transferencia_directa';
  return 'zelle';
}

function cleanText(value?: string | null) {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function cleanReference(value?: string | null) {
  const normalized = (value ?? '').replace(/[^A-Za-z0-9\-_]/g, '').trim();
  return normalized || null;
}

function cleanDocument(value?: string | null) {
  const normalized = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  return normalized || null;
}

function cleanPhone(value?: string | null) {
  const normalized = (value ?? '').replace(/[^\d+]/g, '').trim();
  return normalized || null;
}

function cleanDate(value?: string | null) {
  const date = (value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && dayjs(date, 'YYYY-MM-DD', true).isValid() ? date : null;
}

function cleanBank(value?: string | null) {
  const normalized = cleanText(value);
  if (!normalized) return null;
  const digits = normalized.replace(/\D+/g, '');
  if (digits.length === 4) return digits;
  return normalized;
}

function amountMatches(detected: number | null, expected?: number | null) {
  if (detected === null || expected === null || expected === undefined) return null;
  return Math.abs(Number(detected) - Number(expected)) < 0.01;
}

function preview(rawText?: string | null) {
  return (rawText ?? '').replace(/\s+/g, ' ').trim().slice(0, 320);
}

function imageHash(imageDataUrl: string) {
  const base64 = imageDataUrl.replace(/^data:image\/(?:png|jpe?g|webp);base64,/i, '');
  return crypto.createHash('sha256').update(base64).digest('hex');
}

function fieldsFor(method: CaptureExtractionMethod, vision: VisionExtractionResult | null): ExtractedFields {
  const amount = typeof vision?.amount === 'number' ? Math.round(vision.amount * 100) / 100 : null;
  const base = {
    reference: cleanReference(vision?.reference),
    payerName: cleanText(vision?.customerName),
    paymentDate: cleanDate(vision?.date),
    bankOrigin: null,
    bankDestination: null,
    customerDocument: null,
    customerPhone: null,
    amount,
    currency: vision?.currency ?? null,
  };

  if (method === 'pago_movil') {
    return {
      ...base,
      bankOrigin: cleanBank(vision?.originBank ?? vision?.bank),
      bankDestination: cleanBank(vision?.destinationBank),
      customerDocument: cleanDocument(vision?.clientId),
      customerPhone: cleanPhone(vision?.phoneNumber),
    };
  }

  if (method === 'transferencia_directa') {
    return {
      ...base,
      bankOrigin: cleanBank(vision?.originBank ?? vision?.bank),
      bankDestination: cleanBank(vision?.destinationBank),
      customerDocument: cleanDocument(vision?.clientId),
      customerPhone: null,
    };
  }

  return base;
}

function missingFields(method: CaptureExtractionMethod, fields: ExtractedFields) {
  const missing: string[] = [];

  if (method === 'zelle') {
    if (!fields.reference && !fields.payerName) missing.push('referencia o nombre');
    if (fields.amount === null) missing.push('monto');
    return missing;
  }

  if (!fields.reference) missing.push(method === 'binance' ? 'ID de orden' : 'referencia');
  if (fields.amount === null) missing.push('monto');
  if (!fields.paymentDate) missing.push('fecha');

  if (method === 'pago_movil' || method === 'transferencia_directa') {
    if (!fields.bankOrigin) missing.push('banco origen');
    if (!fields.customerDocument) missing.push('cedula/RIF');
    if (method === 'pago_movil' && !fields.customerPhone) missing.push('telefono');
  }

  return missing;
}

export function normalizeCaptureExtraction(input: {
  companySlug: string;
  request: CaptureExtractionInput;
  vision: VisionExtractionResult | null;
}): NormalizedCaptureExtraction {
  const method = normalizeMethod(input.request.ledgerMethod ?? input.request.method);
  const hash = imageHash(input.request.imageDataUrl);
  const fields = fieldsFor(method, input.vision);
  const confidence = Math.max(0, Math.min(100, input.vision?.confidence ?? 0));
  const warnings: string[] = [];
  const amountMatch = amountMatches(fields.amount, input.request.amount ?? null);

  if (input.vision && !input.vision.isTransferProof) {
    warnings.push('La imagen no parece ser un comprobante de pago.');
  }
  if (confidence > 0 && confidence < 50) {
    warnings.push('La lectura tiene baja confianza; revise los datos antes de aplicar.');
  }
  if (amountMatch === false) {
    warnings.push('El monto detectado no coincide con el monto esperado.');
  }

  const missing = missingFields(method, fields);
  const ok = Boolean(input.vision?.isTransferProof) && confidence >= 45;

  return {
    ok,
    method,
    fields,
    confidence,
    missingFields: missing,
    warnings,
    amountMatch,
    rawTextPreview: preview(input.vision?.rawText),
    extractionId: `cap_${crypto
      .createHash('sha1')
      .update(`${input.companySlug}|${method}|${hash}`)
      .digest('hex')
      .slice(0, 20)}`,
    imageHash: hash,
    failureReason: input.vision?.failureReason,
  };
}

export async function extractCaptureVerification(
  companySlug: string,
  request: CaptureExtractionInput,
): Promise<NormalizedCaptureExtraction> {
  const method = normalizeMethod(request.ledgerMethod ?? request.method);
  const referenceDate = request.paymentDate ? new Date(`${request.paymentDate}T12:00:00-04:00`) : new Date();
  const vision = await extractVerificationFromImageDataUri({
    imageDataUri: request.imageDataUrl,
    method: method as VerificationPaymentMethod,
    referenceDate,
  });

  return normalizeCaptureExtraction({
    companySlug,
    request: {
      ...request,
      ledgerMethod: method,
    },
    vision,
  });
}
