import { createHmac } from 'node:crypto';

import type { CreateManualVerificationInput, SenderMatchType, VerificationReasonCode } from '@ledgerlink/shared';

import { env } from '../../config/env';
import { dayjs } from '../../lib/dayjs';
import { logger } from '../../lib/logger';
import { normalizeComparable } from '../email-processing/helpers';
import type { ExactAuthorizationSpec } from './exact-authorization';

const BUSINESS_OFFSET_MINUTES = -4 * 60;
const BINANCE_PAY_TRANSACTIONS_PATH = '/sapi/v1/pay/transactions';

type UnknownRecord = Record<string, unknown>;

export type BinancePayMatchMode = 'both' | 'reference_only' | 'name_only' | 'none';
export type BinancePayDateStrategy = 'exact_window' | 'same_day' | null;

export interface BinancePayInfo {
  name?: string;
  type?: string;
  email?: string;
  binanceId?: string | number;
  accountId?: string | number;
  countryCode?: string | number;
  phoneNumber?: string | number;
  mobileCode?: string | number;
}

export interface BinancePayFundsDetail {
  currency?: string;
  amount?: string | number;
}

export interface BinancePayTransaction {
  orderType?: string;
  transactionId?: string | number;
  transactionTime?: string | number;
  amount?: string | number;
  currency?: string;
  walletType?: number;
  walletTypes?: number[];
  fundsDetail?: BinancePayFundsDetail[];
  payerInfo?: BinancePayInfo;
  receiverInfo?: BinancePayInfo;
  orderId?: string | number;
  orderNo?: string | number;
  merchantTradeNo?: string | number;
  tradeId?: string | number;
  bizId?: string | number;
  [key: string]: unknown;
}

export interface BinancePayAuthorizationEvidence {
  source: 'binance_api';
  transactionId: string | null;
  orderType: string | null;
  transactionTime: string | null;
  amount: number | null;
  currency: string | null;
  assetSymbol: string | null;
  payerName: string | null;
  payerBinanceId: string | null;
  receiverName: string | null;
  receiverBinanceId: string | null;
  receiverAccountId: string | null;
  receiverEmail: string | null;
  receiverMatched: boolean | 'unknown';
  matchMode: BinancePayMatchMode;
  dateStrategy: BinancePayDateStrategy;
  referenceMatched: boolean;
  nameMatched: boolean;
  amountMatched: boolean;
}

export interface BinancePayApiSummary {
  checked: boolean;
  configured: boolean;
  windowStart: string | null;
  windowEnd: string | null;
  transactionCount: number;
  matchedTransactionId: string | null;
  matchMode: BinancePayMatchMode;
  dateStrategy: BinancePayDateStrategy;
  evidence: BinancePayAuthorizationEvidence | null;
  errorCode?: string;
}

export interface BinancePayAuthorizationResult {
  authorized: boolean;
  reasonCode: VerificationReasonCode;
  candidateCount: number;
  senderMatchType: SenderMatchType;
  evidence: null;
  binanceApi: BinancePayApiSummary;
  strongestEmail: null;
  strongestAuthStatus: 'high' | null;
  strongestAuthScore: number | null;
  officialSenderMatched: boolean | 'unknown';
  riskFlags: string[];
}

interface BinancePayRequestWindow {
  startTime: Date;
  endTime: Date;
}

interface TransactionEvaluation {
  transaction: BinancePayTransaction;
  referenceMatched: boolean;
  nameMatched: boolean;
  amountMatched: boolean;
  currencyMatched: boolean;
  exactDateMatched: boolean;
  sameDayMatched: boolean;
  receiverMatched: boolean | 'unknown';
  isIncome: boolean;
  matchMode: BinancePayMatchMode;
  dateStrategy: BinancePayDateStrategy;
}

function isBinanceApiConfigured() {
  return Boolean(env.BINANCE_API_KEY.trim() && env.BINANCE_API_SECRET.trim());
}

function toStringValue(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  return '';
}

function toOptionalString(value: unknown) {
  const text = toStringValue(value);
  return text || null;
}

function toNumberValue(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function amountEquals(left: number | null | undefined, right: number) {
  if (left === null || left === undefined) {
    return false;
  }

  return Math.abs(Math.abs(left) - right) < 0.01;
}

function buildSignedQuery(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const signature = createHmac('sha256', env.BINANCE_API_SECRET).update(query).digest('hex');
  return `${query}&signature=${signature}`;
}

function readDataRows(payload: unknown): BinancePayTransaction[] {
  const data = (payload as { data?: unknown })?.data;
  if (Array.isArray(data)) {
    return data as BinancePayTransaction[];
  }

  if (Array.isArray((data as { rows?: unknown })?.rows)) {
    return (data as { rows: BinancePayTransaction[] }).rows;
  }

  if (Array.isArray((payload as { rows?: unknown })?.rows)) {
    return (payload as { rows: BinancePayTransaction[] }).rows;
  }

  return [];
}

export function buildBinancePayRequestWindow(spec: ExactAuthorizationSpec): BinancePayRequestWindow {
  const businessDay = dayjs(spec.operationAt).utcOffset(BUSINESS_OFFSET_MINUTES);
  const dayStart = businessDay.startOf('day').toDate();
  const dayEnd = businessDay.endOf('day').toDate();

  return {
    startTime: new Date(Math.min(dayStart.getTime(), spec.expectedWindowFrom.getTime())),
    endTime: new Date(Math.max(dayEnd.getTime(), spec.expectedWindowTo.getTime())),
  };
}

export async function fetchBinancePayTransactions(window: BinancePayRequestWindow) {
  if (!isBinanceApiConfigured()) {
    throw new Error('binance_api_not_configured');
  }

  const signedQuery = buildSignedQuery({
    startTime: String(window.startTime.getTime()),
    endTime: String(window.endTime.getTime()),
    limit: '100',
    recvWindow: String(env.BINANCE_RECV_WINDOW_MS),
    timestamp: String(Date.now()),
  });
  const baseUrl = env.BINANCE_API_BASE_URL.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}${BINANCE_PAY_TRANSACTIONS_PATH}?${signedQuery}`, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': env.BINANCE_API_KEY,
    },
  });

  const payload = (await response.json().catch(() => null)) as UnknownRecord | null;
  if (!response.ok) {
    const code = toStringValue(payload?.code) || `http_${response.status}`;
    const message = toStringValue(payload?.msg ?? payload?.message) || 'Binance API request failed.';
    throw new Error(`${code}:${message}`);
  }

  return readDataRows(payload);
}

function tokenizeName(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function nameMatches(actual?: string | null, expected?: string | null) {
  const actualComparable = normalizeComparable(actual);
  const expectedComparable = normalizeComparable(expected);
  if (!actualComparable || !expectedComparable) {
    return false;
  }

  if (actualComparable === expectedComparable) {
    return true;
  }

  const actualTokens = [...new Set(tokenizeName(actual))];
  const expectedTokens = [...new Set(tokenizeName(expected))];
  if (actualTokens.length < 2 || expectedTokens.length < 2) {
    return false;
  }

  const [shorterTokens, longerTokens] =
    actualTokens.length <= expectedTokens.length
      ? [actualTokens, expectedTokens]
      : [expectedTokens, actualTokens];

  return shorterTokens.every((token) => longerTokens.includes(token));
}

function referenceValues(transaction: BinancePayTransaction) {
  return [
    transaction.transactionId,
    transaction.orderId,
    transaction.orderNo,
    transaction.merchantTradeNo,
    transaction.tradeId,
    transaction.bizId,
  ]
    .map(toStringValue)
    .filter(Boolean);
}

function referenceMatches(transaction: BinancePayTransaction, expected?: string | null) {
  const expectedComparable = normalizeComparable(expected);
  if (!expectedComparable) {
    return false;
  }

  return referenceValues(transaction).some((value) => {
    const actualComparable = normalizeComparable(value);
    return (
      actualComparable === expectedComparable ||
      (expectedComparable.length >= 8 && actualComparable.includes(expectedComparable)) ||
      (actualComparable.length >= 8 && expectedComparable.includes(actualComparable))
    );
  });
}

function getTransactionAmount(transaction: BinancePayTransaction) {
  const directAmount = toNumberValue(transaction.amount);
  if (directAmount !== null) {
    return directAmount;
  }

  const firstFund = transaction.fundsDetail?.find((item) => toNumberValue(item.amount) !== null);
  return toNumberValue(firstFund?.amount);
}

function getTransactionAsset(transaction: BinancePayTransaction) {
  const directCurrency = toOptionalString(transaction.currency);
  if (directCurrency) {
    return directCurrency.toUpperCase();
  }

  return toOptionalString(transaction.fundsDetail?.[0]?.currency)?.toUpperCase() ?? null;
}

function currencyMatches(transaction: BinancePayTransaction, expected: CreateManualVerificationInput['moneda']) {
  const asset = getTransactionAsset(transaction);
  if (!asset) {
    return true;
  }

  if (expected === 'USD' && asset === 'USDT') {
    return true;
  }

  return asset === expected;
}

function getTransactionDate(transaction: BinancePayTransaction) {
  const timestamp = transaction.transactionTime;
  if (typeof timestamp === 'number') {
    return new Date(timestamp);
  }

  if (typeof timestamp === 'string') {
    const numeric = Number(timestamp);
    if (Number.isFinite(numeric)) {
      return new Date(numeric);
    }

    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function isWithinExpectedWindow(transaction: BinancePayTransaction, spec: ExactAuthorizationSpec) {
  const transactionDate = getTransactionDate(transaction);
  return Boolean(
    transactionDate &&
      transactionDate >= spec.expectedWindowFrom &&
      transactionDate <= spec.expectedWindowTo,
  );
}

function isSameBusinessDay(transaction: BinancePayTransaction, spec: ExactAuthorizationSpec) {
  const transactionDate = getTransactionDate(transaction);
  if (!transactionDate) {
    return false;
  }

  return (
    dayjs(transactionDate).utcOffset(BUSINESS_OFFSET_MINUTES).format('YYYY-MM-DD') ===
    dayjs(spec.operationAt).utcOffset(BUSINESS_OFFSET_MINUTES).format('YYYY-MM-DD')
  );
}

function receiverValues(transaction: BinancePayTransaction) {
  const receiverInfo = transaction.receiverInfo ?? {};
  return [
    receiverInfo.binanceId,
    receiverInfo.accountId,
    receiverInfo.email,
    receiverInfo.name,
    receiverInfo.phoneNumber,
  ]
    .map(toStringValue)
    .filter(Boolean);
}

function receiverMatches(transaction: BinancePayTransaction, allowedReceiverId?: string | null): boolean | 'unknown' {
  const rawAllowed = allowedReceiverId?.trim() ?? '';
  const allowed = ['specify', '[specify]', 'todo', 'pending'].includes(rawAllowed.toLowerCase())
    ? ''
    : normalizeComparable(rawAllowed);
  if (!allowed) {
    return 'unknown';
  }

  const values = receiverValues(transaction);
  if (values.length === 0) {
    return 'unknown';
  }

  return values.some((value) => normalizeComparable(value) === allowed);
}

function payerName(transaction: BinancePayTransaction) {
  return toOptionalString(transaction.payerInfo?.name);
}

function evaluateTransaction(
  spec: ExactAuthorizationSpec,
  transaction: BinancePayTransaction,
  allowedReceiverId?: string | null,
): TransactionEvaluation {
  const hasReference = Boolean(normalizeComparable(spec.referenceExpected));
  const hasName = Boolean(normalizeComparable(spec.customerNameExpected));
  const transactionAmount = getTransactionAmount(transaction);
  const referenceMatched = hasReference ? referenceMatches(transaction, spec.referenceExpected) : false;
  const nameMatched = hasName ? nameMatches(payerName(transaction), spec.customerNameExpected) : false;
  const amountMatched = amountEquals(transactionAmount, spec.amountExpected);
  const exactDateMatched = isWithinExpectedWindow(transaction, spec);
  const sameDayMatched = isSameBusinessDay(transaction, spec);
  const receiverMatched = receiverMatches(transaction, allowedReceiverId);
  const currencyMatched = currencyMatches(transaction, spec.currency);
  const isIncome = transactionAmount !== null && transactionAmount > 0;
  const matchMode: BinancePayMatchMode = hasReference && hasName && referenceMatched && nameMatched
    ? 'both'
    : referenceMatched
      ? 'reference_only'
      : nameMatched
        ? 'name_only'
        : 'none';
  const dateStrategy: BinancePayDateStrategy = exactDateMatched ? 'exact_window' : sameDayMatched ? 'same_day' : null;

  return {
    transaction,
    referenceMatched,
    nameMatched,
    amountMatched,
    currencyMatched,
    exactDateMatched,
    sameDayMatched,
    receiverMatched,
    isIncome,
    matchMode,
    dateStrategy,
  };
}

function selectAuthorizedEvaluation(evaluations: TransactionEvaluation[], hasReference: boolean, hasName: boolean) {
  const viable = evaluations.filter(
    (evaluation) =>
      evaluation.isIncome &&
      evaluation.amountMatched &&
      evaluation.currencyMatched &&
      evaluation.dateStrategy !== null &&
      evaluation.receiverMatched !== false,
  );

  const both = viable.find((evaluation) => hasReference && hasName && evaluation.matchMode === 'both');
  if (both) {
    return both;
  }

  const reference = viable.find((evaluation) => hasReference && evaluation.referenceMatched);
  if (reference) {
    return reference;
  }

  return viable.find((evaluation) => hasName && evaluation.nameMatched) ?? null;
}

function chooseBestEvidence(evaluations: TransactionEvaluation[], spec: ExactAuthorizationSpec) {
  return [...evaluations].sort((left, right) => {
    const leftIdentity = Number(left.referenceMatched) + Number(left.nameMatched);
    const rightIdentity = Number(right.referenceMatched) + Number(right.nameMatched);
    if (rightIdentity !== leftIdentity) {
      return rightIdentity - leftIdentity;
    }

    if (Number(right.amountMatched) !== Number(left.amountMatched)) {
      return Number(right.amountMatched) - Number(left.amountMatched);
    }

    const leftTime = getTransactionDate(left.transaction)?.getTime() ?? 0;
    const rightTime = getTransactionDate(right.transaction)?.getTime() ?? 0;
    const leftDistance = Math.abs(leftTime - spec.operationAt.getTime());
    const rightDistance = Math.abs(rightTime - spec.operationAt.getTime());
    return leftDistance - rightDistance;
  })[0] ?? null;
}

function buildRiskFlags(evaluation: TransactionEvaluation | null) {
  const flags: string[] = [];

  if (!evaluation) {
    return flags;
  }

  if (evaluation.dateStrategy === 'same_day') {
    flags.push('authorized_via_same_day');
  }

  if (evaluation.matchMode === 'reference_only') {
    flags.push('authorized_via_reference_only');
  }

  if (evaluation.matchMode === 'name_only') {
    flags.push('authorized_via_name_only');
  }

  if (evaluation.receiverMatched === 'unknown') {
    flags.push('binance_receiver_unconfirmed');
  }

  return flags;
}

function buildEvidence(evaluation: TransactionEvaluation | null): BinancePayAuthorizationEvidence | null {
  if (!evaluation) {
    return null;
  }

  const transaction = evaluation.transaction;
  const transactionDate = getTransactionDate(transaction);

  return {
    source: 'binance_api',
    transactionId: toOptionalString(transaction.transactionId ?? transaction.orderId ?? transaction.orderNo),
    orderType: toOptionalString(transaction.orderType),
    transactionTime: transactionDate?.toISOString() ?? null,
    amount: getTransactionAmount(transaction),
    currency: 'USD',
    assetSymbol: getTransactionAsset(transaction),
    payerName: payerName(transaction),
    payerBinanceId: toOptionalString(transaction.payerInfo?.binanceId),
    receiverName: toOptionalString(transaction.receiverInfo?.name),
    receiverBinanceId: toOptionalString(transaction.receiverInfo?.binanceId),
    receiverAccountId: toOptionalString(transaction.receiverInfo?.accountId),
    receiverEmail: toOptionalString(transaction.receiverInfo?.email),
    receiverMatched: evaluation.receiverMatched,
    matchMode: evaluation.matchMode,
    dateStrategy: evaluation.dateStrategy,
    referenceMatched: evaluation.referenceMatched,
    nameMatched: evaluation.nameMatched,
    amountMatched: evaluation.amountMatched,
  };
}

function reasonFromEvaluations(
  evaluations: TransactionEvaluation[],
  hasReference: boolean,
  hasName: boolean,
): VerificationReasonCode {
  const receiverCandidates = evaluations.filter((evaluation) => evaluation.isIncome && evaluation.receiverMatched !== false);
  if (receiverCandidates.length === 0) {
    return 'sender';
  }

  const identityCandidates = receiverCandidates.filter((evaluation) =>
    hasReference && hasName
      ? evaluation.referenceMatched || evaluation.nameMatched
      : hasReference
        ? evaluation.referenceMatched
        : evaluation.nameMatched,
  );

  if (identityCandidates.length === 0) {
    return hasReference ? 'reference' : 'name';
  }

  const amountCandidates = identityCandidates.filter(
    (evaluation) => evaluation.amountMatched && evaluation.currencyMatched,
  );

  if (amountCandidates.length === 0) {
    return 'amount';
  }

  return 'date';
}

function baseApiSummary(
  configured: boolean,
  checked: boolean,
  window: BinancePayRequestWindow | null,
): BinancePayApiSummary {
  return {
    checked,
    configured,
    windowStart: window?.startTime.toISOString() ?? null,
    windowEnd: window?.endTime.toISOString() ?? null,
    transactionCount: 0,
    matchedTransactionId: null,
    matchMode: 'none',
    dateStrategy: null,
    evidence: null,
  };
}

function buildResult(
  spec: ExactAuthorizationSpec,
  window: BinancePayRequestWindow,
  transactions: BinancePayTransaction[],
  allowedReceiverId?: string | null,
): BinancePayAuthorizationResult {
  const hasReference = Boolean(normalizeComparable(spec.referenceExpected));
  const hasName = Boolean(normalizeComparable(spec.customerNameExpected));

  if (!hasReference && !hasName) {
    return {
      authorized: false,
      reasonCode: 'identity_required',
      candidateCount: 0,
      senderMatchType: 'none',
      evidence: null,
      binanceApi: {
        ...baseApiSummary(true, true, window),
        transactionCount: transactions.length,
      },
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: 'unknown',
      riskFlags: [],
    };
  }

  const evaluations = transactions.map((transaction) => evaluateTransaction(spec, transaction, allowedReceiverId));
  const authorizedEvaluation = selectAuthorizedEvaluation(evaluations, hasReference, hasName);
  const evidenceEvaluation = authorizedEvaluation ?? chooseBestEvidence(evaluations, spec);
  const evidence = buildEvidence(evidenceEvaluation);
  const authorized = Boolean(authorizedEvaluation);
  const riskFlags = buildRiskFlags(authorizedEvaluation);

  return {
    authorized,
    reasonCode: authorized ? 'authorized' : reasonFromEvaluations(evaluations, hasReference, hasName),
    candidateCount: authorized ? 1 : 0,
    senderMatchType: authorized || evidence ? 'email' : 'none',
    evidence: null,
    binanceApi: {
      ...baseApiSummary(true, true, window),
      transactionCount: transactions.length,
      matchedTransactionId: evidence?.transactionId ?? null,
      matchMode: evidence?.matchMode ?? 'none',
      dateStrategy: evidence?.dateStrategy ?? null,
      evidence,
    },
    strongestEmail: null,
    strongestAuthStatus: evidence ? 'high' : null,
    strongestAuthScore: evidence ? 100 : null,
    officialSenderMatched: evidence?.receiverMatched ?? 'unknown',
    riskFlags,
  };
}

export function evaluateBinancePayTransactions(
  spec: ExactAuthorizationSpec,
  transactions: BinancePayTransaction[],
  allowedReceiverId?: string | null,
) {
  return buildResult(spec, buildBinancePayRequestWindow(spec), transactions, allowedReceiverId);
}

export async function evaluateBinancePayAuthorization(
  spec: ExactAuthorizationSpec,
): Promise<BinancePayAuthorizationResult> {
  const window = buildBinancePayRequestWindow(spec);
  const hasReference = Boolean(normalizeComparable(spec.referenceExpected));
  const hasName = Boolean(normalizeComparable(spec.customerNameExpected));
  const configured = isBinanceApiConfigured();

  if (!hasReference && !hasName) {
    return {
      authorized: false,
      reasonCode: 'identity_required',
      candidateCount: 0,
      senderMatchType: 'none',
      evidence: null,
      binanceApi: baseApiSummary(configured, false, window),
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: 'unknown',
      riskFlags: [],
    };
  }

  if (!configured) {
    return {
      authorized: false,
      reasonCode: 'sender',
      candidateCount: 0,
      senderMatchType: 'none',
      evidence: null,
      binanceApi: {
        ...baseApiSummary(false, false, window),
        errorCode: 'binance_api_not_configured',
      },
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: 'unknown',
      riskFlags: ['binance_api_not_configured'],
    };
  }

  try {
    const transactions = await fetchBinancePayTransactions(window);
    return buildResult(spec, window, transactions, env.BINANCE_ALLOWED_RECEIVER_ID);
  } catch (error) {
    logger.warn({ err: error }, 'Binance Pay authorization request failed');

    return {
      authorized: false,
      reasonCode: 'sender',
      candidateCount: 0,
      senderMatchType: 'none',
      evidence: null,
      binanceApi: {
        ...baseApiSummary(true, true, window),
        errorCode: error instanceof Error ? error.message : 'binance_api_error',
      },
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: 'unknown',
      riskFlags: ['binance_api_error'],
    };
  }
}
