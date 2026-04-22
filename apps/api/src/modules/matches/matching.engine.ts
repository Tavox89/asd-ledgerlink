import type { ExpectedTransfer } from '@prisma/client';
import type { AuthEvaluationResult, CurrencyCode, MatchReason } from '@ledgerlink/shared';

import { normalizeComparable } from '../email-processing/helpers';
import type { ParsedNotificationResult } from '../email-processing/types';

export interface TransferCandidateInput {
  id: string;
  referenceExpected: string;
  amountExpected: number;
  currency: CurrencyCode;
  expectedBank: string;
  expectedWindowFrom: Date;
  expectedWindowTo: Date;
  destinationAccountLast4?: string | null;
  customerName?: string | null;
}

export interface MatchEvaluationResult {
  expectedTransferId: string;
  score: number;
  status: 'no_match' | 'possible_match' | 'strong_match' | 'preconfirmed' | 'needs_review';
  reasons: MatchReason[];
  criticalFlags: string[];
  exactReference: boolean;
  exactAmount: boolean;
}

function pushReason(
  reasons: MatchReason[],
  code: string,
  label: string,
  weight: number,
  matched: boolean,
  detail?: string,
) {
  reasons.push({
    code,
    label,
    weight,
    matched,
    detail,
  });
}

function amountEquals(left: number | null | undefined, right: number) {
  if (left === null || left === undefined) {
    return false;
  }
  return Math.abs(left - right) < 0.01;
}

function isWithinWindow(date: Date | null | undefined, start: Date, end: Date) {
  if (!date) {
    return false;
  }
  return date >= start && date <= end;
}

function resolveInitialStatus(score: number): MatchEvaluationResult['status'] {
  if (score < 45) {
    return 'no_match';
  }
  if (score < 75) {
    return 'possible_match';
  }
  return 'strong_match';
}

function hasExplicitExpectedBank(value: string) {
  const normalized = normalizeComparable(value);
  return Boolean(normalized) && !['banconoespecificado', 'anybank', 'sinbanco'].includes(normalized);
}

export function evaluateTransferMatches(
  parsedNotification: ParsedNotificationResult,
  authEvaluation: AuthEvaluationResult,
  transfers: TransferCandidateInput[],
): MatchEvaluationResult[] {
  const evaluated = transfers.map<MatchEvaluationResult & { signalCombo: boolean }>((transfer) => {
    const reasons: MatchReason[] = [];
    const expectedReference = normalizeComparable(transfer.referenceExpected);
    const parsedReference = normalizeComparable(parsedNotification.reference);
    const bankRequired = hasExplicitExpectedBank(transfer.expectedBank);
    const bankMatch =
      bankRequired &&
      normalizeComparable(parsedNotification.bankName) === normalizeComparable(transfer.expectedBank);
    const officialSenderSignal = !bankRequired && authEvaluation.flags.sender_allowed === true;
    const currencyMatch =
      (parsedNotification.currency ?? null) === transfer.currency ||
      !parsedNotification.currency;
    const exactReference =
      Boolean(parsedReference) &&
      Boolean(expectedReference) &&
      parsedReference === expectedReference;
    const exactAmount = amountEquals(parsedNotification.amount, transfer.amountExpected);
    const temporalMatch = isWithinWindow(
      parsedNotification.transferAt,
      transfer.expectedWindowFrom,
      transfer.expectedWindowTo,
    );
    const last4Match =
      Boolean(parsedNotification.destinationAccountLast4) &&
      Boolean(transfer.destinationAccountLast4) &&
      parsedNotification.destinationAccountLast4 === transfer.destinationAccountLast4;
    const nameMatch =
      Boolean(parsedNotification.originatorName) &&
      Boolean(transfer.customerName) &&
      (normalizeComparable(parsedNotification.originatorName).includes(
        normalizeComparable(transfer.customerName),
      ) ||
        normalizeComparable(transfer.customerName).includes(
          normalizeComparable(parsedNotification.originatorName),
        ));

    let score = 0;
    if (exactReference) score += 45;
    if (exactAmount) score += 25;
    if (bankMatch) score += 10;
    if (officialSenderSignal) score += 10;
    if (currencyMatch) score += 5;
    if (temporalMatch) score += 8;
    if (last4Match) score += 5;
    if (nameMatch) score += 2;

    pushReason(reasons, 'reference', 'Referencia exacta', 45, exactReference);
    pushReason(reasons, 'amount', 'Monto exacto', 25, exactAmount);
    pushReason(
      reasons,
      'bank',
      bankRequired ? 'Banco coincide' : 'Remitente oficial allowlisted',
      10,
      bankRequired ? bankMatch : officialSenderSignal,
    );
    pushReason(reasons, 'currency', 'Moneda consistente', 5, currencyMatch);
    pushReason(reasons, 'time_window', 'Dentro de la ventana esperada', 8, temporalMatch);
    pushReason(reasons, 'last4', 'Ultimos 4 consistentes', 5, last4Match);
    pushReason(reasons, 'name', 'Nombre relacionado', 2, nameMatch);

    const signalCombo =
      exactAmount &&
      temporalMatch &&
      (bankMatch || officialSenderSignal) &&
      (last4Match || nameMatch);

    return {
      expectedTransferId: transfer.id,
      score,
      status: resolveInitialStatus(score),
      reasons,
      criticalFlags: authEvaluation.riskFlags.filter((flag) =>
        ['reply_to_mismatch', 'suspicious_domain', 'forwarded_or_resent'].includes(flag),
      ),
      exactReference,
      exactAmount,
      signalCombo,
    };
  });

  const sorted = [...evaluated].sort((left, right) => right.score - left.score);
  const top = sorted[0];
  const strongCandidates = sorted.filter((candidate) => candidate.score >= 75);
  const topIsUnique = strongCandidates.length === 1;

  if (
    top &&
    top.score >= 85 &&
    authEvaluation.authStatus === 'high' &&
    top.exactAmount &&
    (top.exactReference || top.signalCombo) &&
    topIsUnique &&
    top.criticalFlags.length === 0
  ) {
    top.status = 'preconfirmed';
  } else if (top && top.score >= 75 && (!topIsUnique || top.criticalFlags.length > 0)) {
    top.status = 'needs_review';
  }

  return sorted.map((candidate) => ({
    expectedTransferId: candidate.expectedTransferId,
    score: candidate.score,
    status: candidate.status,
    reasons: candidate.reasons,
    criticalFlags: candidate.criticalFlags,
    exactReference: candidate.exactReference,
    exactAmount: candidate.exactAmount,
  }));
}

export function mapTransferCandidate(transfer: ExpectedTransfer): TransferCandidateInput {
  return {
    id: transfer.id,
    referenceExpected: transfer.referenceExpected,
    amountExpected: Number(transfer.amountExpected),
    currency: transfer.currency as TransferCandidateInput['currency'],
    expectedBank: transfer.expectedBank,
    expectedWindowFrom: transfer.expectedWindowFrom,
    expectedWindowTo: transfer.expectedWindowTo,
    destinationAccountLast4: transfer.destinationAccountLast4,
    customerName: transfer.customerName,
  };
}
