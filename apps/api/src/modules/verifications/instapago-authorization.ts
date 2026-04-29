import type { PaymentProviderVerificationInput, VerificationReasonCode } from '@ledgerlink/shared';

import { env } from '../../config/env';
import { dayjs } from '../../lib/dayjs';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { PaymentProvider, PaymentProviderMethod } from '../../lib/prisma-runtime';
import { serializePaymentProviderAttempt } from '../../lib/serializers';
import { getDecryptedInstapagoConfig, INSTAPAGO_PROVIDER } from '../payment-providers/payment-providers.service';

type UnknownRecord = Record<string, unknown>;

export type InstapagoVerificationMethod = 'pago_movil' | 'transferencia_directa';

export interface InstapagoProviderApiSummary {
  provider: 'instapago';
  method: InstapagoVerificationMethod;
  checked: boolean;
  configured: boolean;
  providerCode: string | null;
  providerMessage: string | null;
  matchedReference: string | null;
  transactionCount: number;
  evidence: InstapagoEvidence | null;
  errorCode?: string;
  previousAttempt?: ReturnType<typeof serializePaymentProviderAttempt> | null;
}

export interface InstapagoAuthorizationResult {
  authorized: boolean;
  reasonCode: VerificationReasonCode;
  candidateCount: number;
  senderMatchType: 'none';
  evidence: null;
  paymentProviderApi: InstapagoProviderApiSummary;
  strongestEmail: null;
  strongestAuthStatus: 'high' | null;
  strongestAuthScore: number | null;
  officialSenderMatched: boolean | 'unknown';
  riskFlags: string[];
}

interface DecryptedInstapagoConfig {
  id: string;
  companyId: string;
  provider: typeof PaymentProvider.INSTAPAGO;
  isActive: boolean;
  apiBaseUrl: string;
  keyId: string;
  publicKeyId: string;
  defaultReceiptBank: string;
  defaultOriginBank: string | null;
}

interface NormalizedProviderRequest {
  reference: string;
  amount: number;
  amountText: string;
  currency: string;
  paymentDate: string;
  operationDate: Date;
  originBank: string | null;
  destinationBank: string;
  clientId: string | null;
  phoneNumber: string | null;
  customerName: string | null;
  externalRequestId: string | null;
  notes: string | null;
}

interface ProviderHttpResult {
  httpStatus: number;
  payload: UnknownRecord | null;
  rawText: string;
}

interface InstapagoEvidence {
  source: 'instapago_api';
  reference: string | null;
  destinationReference: string | null;
  amount: number | null;
  currency: string;
  paymentDate: string | null;
  originBank: string | null;
  destinationBank: string | null;
  clientId: string | null;
  phoneNumber: string | null;
  referenceMatched: boolean;
  amountMatched: boolean;
  dateMatched: boolean;
  originBankMatched: boolean | 'unknown';
  destinationBankMatched: boolean | 'unknown';
  clientIdMatched: boolean | 'unknown';
  phoneMatched: boolean | 'unknown';
}

const DUPLICATE_PATTERNS = [
  /ya\s+ha\s+sido\s+validado/i,
  /ya\s+validado/i,
  /pago\s+validado/i,
  /payment\s+already\s+validated/i,
];

function toStringValue(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  return '';
}

function firstString(payload: UnknownRecord | null, keys: string[]) {
  if (!payload) {
    return null;
  }

  for (const key of keys) {
    const value = toStringValue(payload[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function toNumberValue(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    let normalized = value.trim().replace(/\s+/g, '');
    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');
    if (hasComma && hasDot) {
      normalized =
        normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
          ? normalized.replace(/\./g, '').replace(',', '.')
          : normalized.replace(/,/g, '');
    } else if (hasComma) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    }

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    const direct = Number(value.trim().replace(/,/g, ''));
    return Number.isFinite(direct) ? direct : null;
  }

  return null;
}

function amountEquals(left: number | null | undefined, right: number) {
  if (left === null || left === undefined) {
    return false;
  }

  return Math.abs(left - right) < 0.01;
}

function normalizeComparable(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function valuesMatch(actual: string | null | undefined, expected: string | null | undefined) {
  const left = normalizeComparable(actual);
  const right = normalizeComparable(expected);
  return Boolean(left && right && left === right);
}

function optionalProviderMatch(actual: string | null, expected: string | null): boolean | 'unknown' {
  if (!expected) {
    return 'unknown';
  }
  if (!actual) {
    return 'unknown';
  }

  return valuesMatch(actual, expected);
}

function normalizeDocument(value?: string | null) {
  const normalized = (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || null;
}

function normalizePhoneForProvider(value?: string | null) {
  const digits = (value ?? '').replace(/[^\d+]/g, '');
  if (!digits) {
    return null;
  }

  if (digits.startsWith('+')) {
    return `00${digits.slice(1)}`;
  }

  if (digits.startsWith('00')) {
    return digits;
  }

  if (digits.startsWith('58')) {
    return `00${digits}`;
  }

  if (digits.startsWith('0')) {
    return `0058${digits.slice(1)}`;
  }

  return digits;
}

function resolvePaymentDate(input: PaymentProviderVerificationInput) {
  if (input.fechaPago) {
    return input.fechaPago;
  }

  return dayjs(input.fechaOperacion).format('YYYY-MM-DD');
}

function normalizeProviderRequest(
  input: PaymentProviderVerificationInput,
  config: DecryptedInstapagoConfig,
  method: InstapagoVerificationMethod,
): NormalizedProviderRequest {
  const paymentDate = resolvePaymentDate(input);
  const destinationBank = input.bancoDestino ?? config.defaultReceiptBank;
  const originBank = input.bancoOrigen ?? config.defaultOriginBank ?? null;
  const requiresPhone = method === 'pago_movil';

  return {
    reference: input.referenciaEsperada.trim(),
    amount: input.montoEsperado,
    amountText: input.montoEsperado.toFixed(2),
    currency: input.moneda ?? 'VES',
    paymentDate,
    operationDate: new Date(`${paymentDate}T12:00:00.000Z`),
    originBank,
    destinationBank,
    clientId: normalizeDocument(input.cedulaCliente),
    phoneNumber: requiresPhone ? normalizePhoneForProvider(input.telefonoCliente) : null,
    customerName: input.nombreClienteOpcional ?? null,
    externalRequestId: input.externalRequestId ?? null,
    notes: input.notas ?? null,
  };
}

function redactProviderRequest(value: Record<string, string | null>) {
  return {
    ...value,
    keyId: value.keyId ? '[redacted]' : null,
    publickeyid: value.publickeyid ? '[redacted]' : null,
    clientid: value.clientid ? '[redacted-client-id]' : null,
    clientId: value.clientId ? '[redacted-client-id]' : null,
    phonenumberclient: value.phonenumberclient ? '[redacted-phone]' : null,
  };
}

function redactProviderResponse(payload: UnknownRecord | null) {
  if (!payload) {
    return null;
  }

  const redacted = { ...payload };
  for (const key of ['clientid', 'clientId', 'rif', 'cedula']) {
    if (redacted[key] !== undefined) {
      redacted[key] = '[redacted-client-id]';
    }
  }
  for (const key of ['phonenumberclient', 'phoneNumberClient', 'phonenumber', 'phoneNumber']) {
    if (redacted[key] !== undefined) {
      redacted[key] = '[redacted-phone]';
    }
  }

  return redacted;
}

function redactEvidence(evidence: InstapagoEvidence | null) {
  if (!evidence) {
    return null;
  }

  return {
    ...evidence,
    clientId: evidence.clientId ? '[redacted-client-id]' : null,
    phoneNumber: evidence.phoneNumber ? '[redacted-phone]' : null,
  };
}

function buildProviderUrl(config: DecryptedInstapagoConfig, path: string) {
  return `${config.apiBaseUrl.replace(/\/+$/, '')}${path}`;
}

function parseJsonPayload(rawText: string) {
  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as UnknownRecord;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<ProviderHttpResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.INSTAPAGO_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const rawText = await response.text();

    return {
      httpStatus: response.status,
      payload: parseJsonPayload(rawText),
      rawText,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('instapago_timeout');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPagoMovilProviderParams(
  config: DecryptedInstapagoConfig,
  request: NormalizedProviderRequest,
) {
  return {
    keyId: config.keyId,
    publickeyid: config.publicKeyId,
    phonenumberclient: request.phoneNumber ?? '',
    clientid: request.clientId ?? '',
    bank: request.originBank ?? '',
    date: request.paymentDate,
    reference: request.reference,
    receiptbank: request.destinationBank,
    amount: request.amountText,
  };
}

function buildTransferProviderParams(
  config: DecryptedInstapagoConfig,
  request: NormalizedProviderRequest,
) {
  return {
    keyId: config.keyId,
    publickeyid: config.publicKeyId,
    date: request.paymentDate,
    reference: request.reference,
    clientId: request.clientId ?? '',
    receiptbank: request.destinationBank,
    bank: request.originBank ?? '',
    amount: request.amountText,
  };
}

async function callInstapagoProvider(
  method: InstapagoVerificationMethod,
  config: DecryptedInstapagoConfig,
  request: NormalizedProviderRequest,
) {
  if (method === 'pago_movil') {
    const params = buildPagoMovilProviderParams(config, request);
    const url = new URL(buildProviderUrl(config, '/v2/Payments/p2p/GetPayment'));
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const result = await fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    return {
      result,
      request: {
        method: 'GET',
        url: `${url.origin}${url.pathname}`,
        params: redactProviderRequest(params),
      },
    };
  }

  const params = buildTransferProviderParams(config, request);
  const result = await fetchWithTimeout(buildProviderUrl(config, '/v2/Transfers/p2c'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });

  return {
    result,
    request: {
      method: 'POST',
      url: buildProviderUrl(config, '/v2/Transfers/p2c'),
      body: redactProviderRequest(params),
    },
  };
}

function providerCode(payload: UnknownRecord | null, httpStatus?: number) {
  return firstString(payload, ['code', 'statusCode', 'status']) ?? (httpStatus ? `http_${httpStatus}` : null);
}

function providerMessage(payload: UnknownRecord | null, rawText?: string) {
  return firstString(payload, ['message', 'msg', 'description', 'error'])
    ?? (rawText?.trim() ? rawText.trim().slice(0, 240) : null);
}

function isDuplicateProviderResponse(payload: UnknownRecord | null) {
  const code = providerCode(payload);
  const message = providerMessage(payload) ?? '';
  return code === '401' || DUPLICATE_PATTERNS.some((pattern) => pattern.test(message));
}

function responseSuccess(payload: UnknownRecord | null) {
  if (!payload) {
    return false;
  }

  const rawSuccess = payload.success;
  if (rawSuccess === true) {
    return true;
  }

  if (typeof rawSuccess === 'string' && rawSuccess.toLowerCase() === 'true') {
    return true;
  }

  const code = providerCode(payload);
  const message = providerMessage(payload) ?? '';
  return code === '201' || /exitosamente|encontrado\s+un\s+pago/i.test(message);
}

function readResponseDate(payload: UnknownRecord | null, fallbackDate: string) {
  const rawDate = firstString(payload, ['date', 'paymentDate', 'operationDate', 'createdAt']);
  if (!rawDate) {
    return fallbackDate;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return rawDate;
  }

  const parsed = dayjs(rawDate);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : fallbackDate;
}

function buildEvidence(
  payload: UnknownRecord | null,
  request: NormalizedProviderRequest,
): InstapagoEvidence {
  const reference = firstString(payload, ['reference', 'referencedest', 'referenceDest', 'id']);
  const destinationReference = firstString(payload, ['referencedest', 'referenceDest', 'destinationReference']);
  const responseAmount = toNumberValue(firstString(payload, ['amount', 'monto']) ?? payload?.amount);
  const responseDate = readResponseDate(payload, request.paymentDate);
  const originBank = firstString(payload, ['bank', 'originBank', 'bankorigin']);
  const destinationBank = firstString(payload, ['receiptbank', 'receiptBank', 'destinationBank']);
  const clientId = normalizeDocument(firstString(payload, ['clientid', 'clientId', 'rif', 'cedula']));
  const phoneNumber = normalizePhoneForProvider(firstString(payload, ['phonenumberclient', 'phoneNumberClient', 'phonenumber']));

  return {
    source: 'instapago_api',
    reference,
    destinationReference,
    amount: responseAmount,
    currency: request.currency,
    paymentDate: responseDate,
    originBank,
    destinationBank,
    clientId,
    phoneNumber,
    referenceMatched: valuesMatch(reference, request.reference) || valuesMatch(destinationReference, request.reference),
    amountMatched: amountEquals(responseAmount, request.amount),
    dateMatched: responseDate === request.paymentDate,
    originBankMatched: optionalProviderMatch(originBank, request.originBank),
    destinationBankMatched: optionalProviderMatch(destinationBank, request.destinationBank),
    clientIdMatched: optionalProviderMatch(clientId, request.clientId),
    phoneMatched: optionalProviderMatch(phoneNumber, request.phoneNumber),
  };
}

function reasonFromEvidence(
  payload: UnknownRecord | null,
  evidence: InstapagoEvidence,
  method: InstapagoVerificationMethod,
): VerificationReasonCode {
  if (!responseSuccess(payload)) {
    return 'reference';
  }

  if (!evidence.referenceMatched) {
    return 'reference';
  }
  if (!evidence.amountMatched) {
    return 'amount';
  }
  if (!evidence.dateMatched) {
    return 'date';
  }
  if (evidence.destinationBankMatched === false || evidence.originBankMatched === false) {
    return 'sender';
  }
  if (evidence.clientIdMatched === false || (method === 'pago_movil' && evidence.phoneMatched === false)) {
    return 'name';
  }

  return 'authorized';
}

function isEvidenceAuthorized(
  payload: UnknownRecord | null,
  evidence: InstapagoEvidence,
  method: InstapagoVerificationMethod,
) {
  return (
    responseSuccess(payload) &&
    evidence.referenceMatched &&
    evidence.amountMatched &&
    evidence.dateMatched &&
    evidence.destinationBankMatched !== false &&
    evidence.originBankMatched !== false &&
    evidence.clientIdMatched !== false &&
    (method !== 'pago_movil' || evidence.phoneMatched !== false)
  );
}

function prismaMethod(method: InstapagoVerificationMethod) {
  return method === 'pago_movil'
    ? PaymentProviderMethod.PAGO_MOVIL
    : PaymentProviderMethod.TRANSFERENCIA_DIRECTA;
}

function toVerificationMethod(method: typeof PaymentProviderMethod.PAGO_MOVIL | typeof PaymentProviderMethod.TRANSFERENCIA_DIRECTA) {
  return method === PaymentProviderMethod.PAGO_MOVIL ? 'pago_movil' : 'transferencia_directa';
}

function buildRequestPayload(request: NormalizedProviderRequest) {
  return {
    referenceExpected: request.reference,
    amountExpected: request.amount,
    currency: request.currency,
    paymentDate: request.paymentDate,
    originBank: request.originBank,
    destinationBank: request.destinationBank,
    clientId: request.clientId ? '[redacted-client-id]' : null,
    phoneNumber: request.phoneNumber ? '[redacted-phone]' : null,
    customerName: request.customerName,
    externalRequestId: request.externalRequestId,
    notes: request.notes,
  };
}

function buildApiSummary(input: {
  method: InstapagoVerificationMethod;
  checked: boolean;
  configured: boolean;
  providerCode?: string | null;
  providerMessage?: string | null;
  matchedReference?: string | null;
  transactionCount?: number;
  evidence?: InstapagoEvidence | null;
  errorCode?: string;
  previousAttempt?: ReturnType<typeof serializePaymentProviderAttempt> | null;
}): InstapagoProviderApiSummary {
  return {
    provider: 'instapago',
    method: input.method,
    checked: input.checked,
    configured: input.configured,
    providerCode: input.providerCode ?? null,
    providerMessage: input.providerMessage ?? null,
    matchedReference: input.matchedReference ?? null,
    transactionCount: input.transactionCount ?? 0,
    evidence: input.evidence ?? null,
    errorCode: input.errorCode,
    previousAttempt: input.previousAttempt,
  };
}

function buildResult(input: {
  method: InstapagoVerificationMethod;
  authorized: boolean;
  reasonCode: VerificationReasonCode;
  candidateCount?: number;
  api: InstapagoProviderApiSummary;
  riskFlags?: string[];
}): InstapagoAuthorizationResult {
  return {
    authorized: input.authorized,
    reasonCode: input.reasonCode,
    candidateCount: input.candidateCount ?? (input.authorized ? 1 : 0),
    senderMatchType: 'none',
    evidence: null,
    paymentProviderApi: input.api,
    strongestEmail: null,
    strongestAuthStatus: input.authorized ? 'high' : null,
    strongestAuthScore: input.authorized ? 100 : null,
    officialSenderMatched: input.authorized ? true : 'unknown',
    riskFlags: input.riskFlags ?? [],
  };
}

async function findPreviousExternalAttempt(input: {
  companyId: string;
  method: InstapagoVerificationMethod;
  externalRequestId: string | null;
}) {
  if (!input.externalRequestId) {
    return null;
  }

  return prisma.paymentProviderVerificationAttempt.findUnique({
    where: {
      companyId_provider_method_externalRequestId: {
        companyId: input.companyId,
        provider: INSTAPAGO_PROVIDER,
        method: prismaMethod(input.method),
        externalRequestId: input.externalRequestId,
      },
    },
    include: {
      company: true,
    },
  });
}

async function findPreviousLocalAttempt(input: {
  companyId: string;
  method: InstapagoVerificationMethod;
  request: NormalizedProviderRequest;
}) {
  const externalAttempt = await findPreviousExternalAttempt({
    companyId: input.companyId,
    method: input.method,
    externalRequestId: input.request.externalRequestId,
  });

  if (externalAttempt) {
    return externalAttempt;
  }

  return prisma.paymentProviderVerificationAttempt.findFirst({
    where: {
      companyId: input.companyId,
      provider: INSTAPAGO_PROVIDER,
      method: prismaMethod(input.method),
      referenceExpected: input.request.reference,
      amountExpected: input.request.amount,
      operationDate: input.request.operationDate,
    },
    include: {
      company: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

function resultFromPreviousAttempt(
  method: InstapagoVerificationMethod,
  attempt: NonNullable<Awaited<ReturnType<typeof findPreviousLocalAttempt>>>,
  checked: boolean,
) {
  const serialized = serializePaymentProviderAttempt(attempt);
  const evidence = (attempt.evidence ?? null) as InstapagoEvidence | null;

  return buildResult({
    method,
    authorized: attempt.authorized,
    reasonCode: attempt.reasonCode as VerificationReasonCode,
    candidateCount: attempt.authorized ? 1 : 0,
    api: buildApiSummary({
      method,
      checked,
      configured: true,
      providerCode: attempt.providerCode,
      providerMessage: attempt.providerMessage,
      matchedReference: attempt.matchedReference,
      transactionCount: attempt.authorized ? 1 : 0,
      evidence: redactEvidence(evidence),
      previousAttempt: serialized,
    }),
    riskFlags: checked ? ['payment_provider_idempotent_replay'] : ['payment_provider_lookup_local_only'],
  });
}

async function persistAttempt(input: {
  companyId: string;
  method: InstapagoVerificationMethod;
  request: NormalizedProviderRequest;
  providerRequest: unknown;
  providerResponse: unknown;
  authorized: boolean;
  reasonCode: VerificationReasonCode;
  providerCode: string | null;
  providerMessage: string | null;
  matchedReference: string | null;
  evidence: InstapagoEvidence | null;
}) {
  return prisma.paymentProviderVerificationAttempt.create({
    data: {
      companyId: input.companyId,
      provider: PaymentProvider.INSTAPAGO,
      method: prismaMethod(input.method),
      externalRequestId: input.request.externalRequestId ?? undefined,
      referenceExpected: input.request.reference,
      amountExpected: input.request.amount,
      currency: input.request.currency,
      operationDate: input.request.operationDate,
      requestPayload: buildRequestPayload(input.request) as never,
      providerRequest: input.providerRequest as never,
      providerResponse: input.providerResponse as never,
      authorized: input.authorized,
      reasonCode: input.reasonCode,
      providerCode: input.providerCode ?? undefined,
      providerMessage: input.providerMessage ?? undefined,
      matchedReference: input.matchedReference ?? undefined,
      evidence: redactEvidence(input.evidence) as never,
    },
    include: {
      company: true,
    },
  });
}

function missingRequiredFieldReason(request: NormalizedProviderRequest, method: InstapagoVerificationMethod) {
  if (!request.reference) {
    return 'reference';
  }
  if (!request.destinationBank || !request.originBank) {
    return 'sender';
  }
  if (!request.clientId) {
    return 'name';
  }
  if (method === 'pago_movil' && !request.phoneNumber) {
    return 'name';
  }

  return null;
}

export async function evaluateInstapagoAuthorization(input: {
  companyId: string;
  method: InstapagoVerificationMethod;
  payload: PaymentProviderVerificationInput;
  mode?: 'authorize' | 'lookup';
}): Promise<InstapagoAuthorizationResult> {
  const config = await getDecryptedInstapagoConfig(input.companyId);
  if (!config) {
    return buildResult({
      method: input.method,
      authorized: false,
      reasonCode: 'provider_error',
      api: buildApiSummary({
        method: input.method,
        checked: false,
        configured: false,
        errorCode: 'instapago_not_configured',
        providerMessage: 'InstaPago is not configured or inactive for this company.',
      }),
      riskFlags: ['instapago_not_configured'],
    });
  }

  const request = normalizeProviderRequest(input.payload, config, input.method);
  const missingReason = missingRequiredFieldReason(request, input.method);
  if (missingReason) {
    return buildResult({
      method: input.method,
      authorized: false,
      reasonCode: missingReason,
      api: buildApiSummary({
        method: input.method,
        checked: false,
        configured: true,
        errorCode: 'instapago_required_field_missing',
        providerMessage: 'Required provider verification fields are missing.',
      }),
      riskFlags: ['instapago_required_field_missing'],
    });
  }

  const previousAttempt = await findPreviousLocalAttempt({
    companyId: input.companyId,
    method: input.method,
    request,
  });

  if (input.mode === 'lookup') {
    if (previousAttempt) {
      return resultFromPreviousAttempt(input.method, previousAttempt, false);
    }

    return buildResult({
      method: input.method,
      authorized: false,
      reasonCode: 'reference',
      api: buildApiSummary({
        method: input.method,
        checked: false,
        configured: true,
        providerMessage: 'No previous InstaPago verification attempt found for this request.',
      }),
      riskFlags: ['payment_provider_lookup_local_only'],
    });
  }

  if (previousAttempt?.externalRequestId && request.externalRequestId) {
    return resultFromPreviousAttempt(input.method, previousAttempt, true);
  }

  try {
    const { result, request: providerRequest } = await callInstapagoProvider(input.method, config, request);
    const payload = result.payload;
    const code = providerCode(payload, result.httpStatus);
    const message = providerMessage(payload, result.rawText);
    const duplicate = isDuplicateProviderResponse(payload);
    const evidence = payload ? buildEvidence(payload, request) : null;
    const authorized = evidence ? isEvidenceAuthorized(payload, evidence, input.method) : false;
    const reasonCode: VerificationReasonCode = duplicate
      ? 'duplicate'
      : evidence
        ? reasonFromEvidence(payload, evidence, input.method)
        : 'provider_error';
    const matchedReference =
      evidence?.referenceMatched
        ? evidence.reference ?? evidence.destinationReference ?? request.reference
        : null;
    const providerResponse = payload
      ? {
          httpStatus: result.httpStatus,
          payload: redactProviderResponse(payload),
        }
      : {
          httpStatus: result.httpStatus,
          payload: null,
          rawText: result.rawText.slice(0, 500),
        };

    const persisted = await persistAttempt({
      companyId: input.companyId,
      method: input.method,
      request,
      providerRequest,
      providerResponse,
      authorized,
      reasonCode,
      providerCode: code,
      providerMessage: message,
      matchedReference,
      evidence,
    });

    return buildResult({
      method: input.method,
      authorized,
      reasonCode,
      candidateCount: authorized ? 1 : 0,
      api: buildApiSummary({
        method: input.method,
        checked: true,
        configured: true,
        providerCode: code,
        providerMessage: message,
        matchedReference,
        transactionCount: evidence && responseSuccess(payload) ? 1 : 0,
        evidence: redactEvidence(evidence),
        previousAttempt: serializePaymentProviderAttempt(persisted),
      }),
      riskFlags: duplicate ? ['instapago_duplicate_validation'] : [],
    });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'instapago_unknown_error';
    logger.warn({ err: error, method: input.method }, 'InstaPago verification request failed');

    await persistAttempt({
      companyId: input.companyId,
      method: input.method,
      request,
      providerRequest: {
        method: input.method,
        error: 'request_failed',
      },
      providerResponse: {
        errorCode,
      },
      authorized: false,
      reasonCode: 'provider_error',
      providerCode: null,
      providerMessage: errorCode,
      matchedReference: null,
      evidence: null,
    });

    return buildResult({
      method: input.method,
      authorized: false,
      reasonCode: 'provider_error',
      api: buildApiSummary({
        method: input.method,
        checked: true,
        configured: true,
        errorCode,
        providerMessage: errorCode,
      }),
      riskFlags: ['instapago_provider_error'],
    });
  }
}

export function paymentProviderMethodLabel(method: InstapagoVerificationMethod) {
  return method === 'pago_movil' ? 'Pago Movil' : 'Transferencia directa';
}

export function paymentProviderBankLabel(method: InstapagoVerificationMethod) {
  return method === 'pago_movil' ? 'Pago Movil InstaPago' : 'Transferencia Directa InstaPago';
}

export function paymentProviderMethodFromPrisma(
  method: typeof PaymentProviderMethod.PAGO_MOVIL | typeof PaymentProviderMethod.TRANSFERENCIA_DIRECTA,
) {
  return toVerificationMethod(method);
}
