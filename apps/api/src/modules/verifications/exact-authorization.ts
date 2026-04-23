import type { Prisma } from '@prisma/client';
import type { CreateManualVerificationInput, SenderMatchType, VerificationReasonCode } from '@ledgerlink/shared';

import { dayjs } from '../../lib/dayjs';
import { prisma } from '../../lib/prisma';
import { serializeInboundEmail } from '../../lib/serializers';
import { normalizeComparable } from '../email-processing/helpers';

export interface VerificationLookupWindow {
  operationAt: Date;
  expectedWindowFrom: Date;
  expectedWindowTo: Date;
}

export interface ExactAuthorizationSpec extends VerificationLookupWindow {
  companyId: string;
  referenceExpected: string | null;
  customerNameExpected: string | null;
  amountExpected: number;
  currency: CreateManualVerificationInput['moneda'];
}

export type VerificationCandidateEmail = Prisma.InboundEmailGetPayload<{
  include: {
    company: true;
    parsedNotification: true;
    matches: true;
  };
}>;

export interface AuthorizationEvidenceRecord {
  id: string;
  gmailMessageId: string;
  senderMatchType: SenderMatchType;
  senderAddress: string | null;
  subject: string | null;
  originatorName: string | null;
  arrivalTimestamp: string | null;
  parsedPaymentTimestamp: string | null;
  receivedAt: string;
  reference: string | null;
  amount: number | null;
  currency: string | null;
  authenticityStatus: string | null;
  authScore: number | null;
  riskFlags: string[];
}

export interface ExactAuthorizationResult {
  authorized: boolean;
  reasonCode: VerificationReasonCode;
  candidateCount: number;
  senderMatchType: SenderMatchType;
  evidence: AuthorizationEvidenceRecord | null;
  strongestEmail: ReturnType<typeof serializeInboundEmail> | null;
  strongestAuthStatus: string | null;
  strongestAuthScore: number | null;
  officialSenderMatched: boolean | 'unknown';
  riskFlags: string[];
  candidateEmails: VerificationCandidateEmail[];
}

function amountEquals(left: number | null | undefined, right: number) {
  if (left === null || left === undefined) {
    return false;
  }

  return Math.abs(left - right) < 0.01;
}

function readRiskFlags(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return [];
}

function getEmailRiskFlags(
  email: Pick<VerificationCandidateEmail, 'authenticityFlags'> | null | undefined,
) {
  const flags =
    (email?.authenticityFlags as
      | { riskFlags?: string[]; flags?: Record<string, boolean | 'unknown'> }
      | null
      | undefined) ?? null;

  return {
    officialSenderMatched: flags?.flags?.sender_allowed ?? 'unknown',
    riskFlags: flags?.riskFlags ?? [],
  };
}

function getArrivalTimestamp(email: VerificationCandidateEmail) {
  return email.internalDate ?? email.receivedAt ?? null;
}

function getParsedPaymentTimestamp(email: VerificationCandidateEmail) {
  return email.parsedNotification?.transferAt ?? null;
}

function timestampDistance(timestamp: Date | null, target: Date) {
  if (!timestamp) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(timestamp.getTime() - target.getTime());
}

function senderPriority(senderMatchType: SenderMatchType) {
  switch (senderMatchType) {
    case 'email':
      return 0;
    case 'domain':
      return 1;
    default:
      return 2;
  }
}

function currencyCompatible(
  email: VerificationCandidateEmail,
  spec: ExactAuthorizationSpec,
) {
  const parsedCurrency = email.parsedNotification?.currency ?? null;
  return parsedCurrency ? parsedCurrency === spec.currency : true;
}

function exactReferenceMatch(
  email: VerificationCandidateEmail,
  spec: ExactAuthorizationSpec,
) {
  const parsedReference = normalizeComparable(email.parsedNotification?.reference);
  const expectedReference = normalizeComparable(spec.referenceExpected);
  return Boolean(parsedReference) && Boolean(expectedReference) && parsedReference === expectedReference;
}

function exactCustomerNameMatch(
  email: VerificationCandidateEmail,
  spec: ExactAuthorizationSpec,
) {
  const parsedSource = email.parsedNotification?.originatorName;
  const expectedSource = spec.customerNameExpected;
  const parsedCustomerName = normalizeComparable(parsedSource);
  const expectedCustomerName = normalizeComparable(expectedSource);

  if (!parsedCustomerName || !expectedCustomerName) {
    return false;
  }

  if (parsedCustomerName === expectedCustomerName) {
    return true;
  }

  const tokenizeComparableName = (value?: string | null) =>
    (value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 1);

  const parsedTokens = [...new Set(tokenizeComparableName(parsedSource))];
  const expectedTokens = [...new Set(tokenizeComparableName(expectedSource))];

  if (parsedTokens.length < 2 || expectedTokens.length < 2) {
    return false;
  }

  const [shorterTokens, longerTokens] =
    parsedTokens.length <= expectedTokens.length
      ? [parsedTokens, expectedTokens]
      : [expectedTokens, parsedTokens];

  return shorterTokens.every((token) => longerTokens.includes(token));
}

function exactAmountMatch(
  email: VerificationCandidateEmail,
  spec: ExactAuthorizationSpec,
) {
  return amountEquals(
    email.parsedNotification?.amount ? Number(email.parsedNotification.amount) : null,
    spec.amountExpected,
  );
}

function withinExpectedWindow(
  email: VerificationCandidateEmail,
  window: VerificationLookupWindow,
) {
  const arrivalTimestamp = getArrivalTimestamp(email);
  return Boolean(
    arrivalTimestamp &&
      arrivalTimestamp >= window.expectedWindowFrom &&
      arrivalTimestamp <= window.expectedWindowTo,
  );
}

function chooseBestEvidence(
  candidates: VerificationCandidateEmail[],
  operationAt: Date,
) {
  return [...candidates].sort((left, right) => {
    const senderDelta = senderPriority(left.senderMatchType.toLowerCase() as SenderMatchType) -
      senderPriority(right.senderMatchType.toLowerCase() as SenderMatchType);
    if (senderDelta !== 0) {
      return senderDelta;
    }

    const leftDistance = timestampDistance(getArrivalTimestamp(left), operationAt);
    const rightDistance = timestampDistance(getArrivalTimestamp(right), operationAt);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    if (right.receivedAt.getTime() !== left.receivedAt.getTime()) {
      return right.receivedAt.getTime() - left.receivedAt.getTime();
    }

    return left.id.localeCompare(right.id);
  })[0] ?? null;
}

function serializeEvidence(email: VerificationCandidateEmail | null) {
  if (!email) {
    return null;
  }

  const { officialSenderMatched, riskFlags } = getEmailRiskFlags(email);

  return {
    id: email.id,
    gmailMessageId: email.gmailMessageId,
    senderMatchType: email.senderMatchType.toLowerCase() as SenderMatchType,
    senderAddress: email.fromAddress ?? null,
    subject: email.subject ?? null,
    originatorName: email.parsedNotification?.originatorName ?? null,
    arrivalTimestamp: getArrivalTimestamp(email)?.toISOString() ?? null,
    parsedPaymentTimestamp: getParsedPaymentTimestamp(email)?.toISOString() ?? null,
    receivedAt: email.receivedAt.toISOString(),
    reference: email.parsedNotification?.reference ?? null,
    amount: email.parsedNotification?.amount ? Number(email.parsedNotification.amount) : null,
    currency: email.parsedNotification?.currency ?? null,
    authenticityStatus: email.authenticityStatus.toLowerCase(),
    authScore: email.authScore,
    riskFlags,
    officialSenderMatched,
  };
}

function buildEvidenceRecord(email: VerificationCandidateEmail | null): AuthorizationEvidenceRecord | null {
  const serialized = serializeEvidence(email);
  if (!serialized) {
    return null;
  }

  return {
    id: serialized.id,
    gmailMessageId: serialized.gmailMessageId,
    senderMatchType: serialized.senderMatchType,
    senderAddress: serialized.senderAddress,
    subject: serialized.subject,
    originatorName: serialized.originatorName,
    arrivalTimestamp: serialized.arrivalTimestamp,
    parsedPaymentTimestamp: serialized.parsedPaymentTimestamp,
    receivedAt: serialized.receivedAt,
    reference: serialized.reference,
    amount: serialized.amount,
    currency: serialized.currency,
    authenticityStatus: serialized.authenticityStatus,
    authScore: serialized.authScore,
    riskFlags: serialized.riskFlags,
  };
}

function selectEvidencePool(
  pools: Array<VerificationCandidateEmail[]>,
) {
  return pools.find((pool) => pool.length > 0) ?? [];
}

export function buildVerificationLookupWindow(
  input: CreateManualVerificationInput,
): VerificationLookupWindow {
  const operationAt = dayjs(input.fechaOperacion);

  return {
    operationAt: operationAt.toDate(),
    expectedWindowFrom: operationAt.subtract(input.toleranciaMinutos, 'minute').toDate(),
    expectedWindowTo: operationAt.add(input.toleranciaMinutos, 'minute').toDate(),
  };
}

export function buildExactAuthorizationSpec(
  companyId: string,
  input: CreateManualVerificationInput,
): ExactAuthorizationSpec {
  const window = buildVerificationLookupWindow(input);

  return {
    companyId,
    ...window,
    referenceExpected: input.referenciaEsperada ?? null,
    customerNameExpected: input.nombreClienteOpcional ?? null,
    amountExpected: input.montoEsperado,
    currency: input.moneda,
  };
}

export async function loadVerificationCandidateEmails(
  spec: ExactAuthorizationSpec,
) {
  const candidateFilters: Prisma.InboundEmailWhereInput[] = [
    {
      parsedNotification: {
        is: {
          amount: spec.amountExpected,
        },
      },
    },
    {
      internalDate: {
        gte: spec.expectedWindowFrom,
        lte: spec.expectedWindowTo,
      },
    },
    {
      receivedAt: {
        gte: spec.expectedWindowFrom,
        lte: spec.expectedWindowTo,
      },
    },
  ];

  if (spec.referenceExpected) {
    candidateFilters.unshift({
      parsedNotification: {
        is: {
          reference: spec.referenceExpected,
        },
      },
    });
  }

  const candidateEmails = await prisma.inboundEmail.findMany({
    where: {
      companyId: spec.companyId,
      OR: candidateFilters,
    },
    include: {
      company: true,
      parsedNotification: true,
      matches: true,
    },
    orderBy: [{ receivedAt: 'desc' }],
    take: 100,
  });

  return {
    window: {
      operationAt: spec.operationAt,
      expectedWindowFrom: spec.expectedWindowFrom,
      expectedWindowTo: spec.expectedWindowTo,
    },
    candidateEmails,
  };
}

export function evaluateExactAuthorization(
  spec: ExactAuthorizationSpec,
  candidateEmails: VerificationCandidateEmail[],
): ExactAuthorizationResult {
  const senderCandidates = candidateEmails.filter(
    (email) => email.senderMatchType !== 'NONE',
  );
  const looseReferenceCandidates = spec.referenceExpected
    ? candidateEmails.filter((email) => exactReferenceMatch(email, spec))
    : [];
  const nameCandidates = senderCandidates.filter((email) => exactCustomerNameMatch(email, spec));
  const looseNameCandidates = candidateEmails.filter((email) => exactCustomerNameMatch(email, spec));
  const looseAmountCandidates = looseNameCandidates.filter(
    (email) => exactAmountMatch(email, spec) && currencyCompatible(email, spec),
  );
  const amountCandidates = nameCandidates.filter(
    (email) => exactAmountMatch(email, spec) && currencyCompatible(email, spec),
  );
  const looseDateCandidates = looseAmountCandidates.filter((email) => withinExpectedWindow(email, spec));
  const exactCandidates = amountCandidates.filter((email) => withinExpectedWindow(email, spec));
  const authorized = exactCandidates.length > 0;
  const reasonCode: VerificationReasonCode = authorized
    ? 'authorized'
    : senderCandidates.length === 0
      ? 'sender'
      : nameCandidates.length === 0
        ? 'name'
        : amountCandidates.length === 0
          ? 'amount'
          : 'date';
  const evidencePool = selectEvidencePool([
    exactCandidates,
    amountCandidates,
    nameCandidates,
    senderCandidates,
    looseDateCandidates,
    looseAmountCandidates,
    looseNameCandidates,
    looseReferenceCandidates,
    candidateEmails,
  ]);
  const evidenceEmail = chooseBestEvidence(evidencePool, spec.operationAt);
  const strongestEmail = evidenceEmail ? serializeInboundEmail(evidenceEmail) : null;
  const evidence = buildEvidenceRecord(evidenceEmail);
  const senderMatchType = evidence?.senderMatchType ?? 'none';
  const { officialSenderMatched, riskFlags } = getEmailRiskFlags(evidenceEmail);

  return {
    authorized,
    reasonCode,
    candidateCount: exactCandidates.length,
    senderMatchType,
    evidence,
    strongestEmail,
    strongestAuthStatus: evidence?.authenticityStatus ?? null,
    strongestAuthScore: evidence?.authScore ?? null,
    officialSenderMatched,
    riskFlags: [...new Set([...(riskFlags ?? []), ...readRiskFlags(evidence?.riskFlags)])],
    candidateEmails,
  };
}
