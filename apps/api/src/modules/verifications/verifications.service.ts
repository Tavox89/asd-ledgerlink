import type { CreateManualVerificationInput, PaymentProviderVerificationInput } from '@ledgerlink/shared';

import { env } from '../../config/env';
import { dayjs } from '../../lib/dayjs';
import { ApiError } from '../../lib/http';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import {
  serializeExpectedTransfer,
  serializeParsedNotification,
  serializeTransferMatch,
} from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';
import { evaluateTransferMatches, type TransferCandidateInput } from '../matches/matching.engine';
import { pullGmailPubSubMessages } from '../pubsub/pubsub.service';
import { createTransfer, confirmTransfer, rejectTransfer } from '../transfers/transfers.service';
import {
  buildExactAuthorizationSpec,
  evaluateExactAuthorization,
  hasVerificationIdentity,
  loadVerificationCandidateEmails,
  type ExactAuthorizationSpec,
  type VerificationCandidateEmail,
} from './exact-authorization';
import { evaluateBinancePayAuthorization } from './binance-pay-authorization';
import {
  evaluateInstapagoAuthorization,
  paymentProviderBankLabel,
  type InstapagoVerificationMethod,
} from './instapago-authorization';
import { normalizeComparable } from '../email-processing/helpers';

interface VerificationAutoRefreshResult {
  attempted: boolean;
  status: 'not_needed' | 'retried' | 'no_messages' | 'failed';
  pulled: number;
  processed: number;
}

export type VerificationMethod = 'zelle' | 'binance' | 'pago_movil' | 'transferencia_directa';

interface VerificationFlowProfile {
  method: VerificationMethod;
  forcedBankName: string | null;
  candidateFilter: (email: VerificationCandidateEmail) => boolean;
}

const ZELLE_PROFILE: VerificationFlowProfile = {
  method: 'zelle',
  forcedBankName: null,
  candidateFilter: () => true,
};

const BINANCE_PROFILE: VerificationFlowProfile = {
  method: 'binance',
  forcedBankName: 'Binance',
  candidateFilter: () => false,
};

function defaultAutoRefreshResult(): VerificationAutoRefreshResult {
  return {
    attempted: false,
    status: 'not_needed',
    pulled: 0,
    processed: 0,
  };
}

function normalizeInputForProfile(
  input: CreateManualVerificationInput,
  profile: VerificationFlowProfile,
): CreateManualVerificationInput {
  if (profile.method !== 'binance') {
    return input;
  }

  return {
    ...input,
    moneda: 'USD',
    bancoEsperado: profile.forcedBankName,
  };
}

function filterCandidatesForProfile(
  candidateEmails: VerificationCandidateEmail[],
  profile: VerificationFlowProfile,
) {
  return candidateEmails.filter(profile.candidateFilter);
}

function resolveProfileFromExpectedBank(expectedBank?: string | null): VerificationFlowProfile {
  return normalizeComparable(expectedBank) === 'binance' ? BINANCE_PROFILE : ZELLE_PROFILE;
}

async function loadVerificationTransfer(id: string) {
  return prisma.expectedTransfer.findFirst({
    where: { id },
    include: {
      company: true,
      matches: {
        include: {
          inboundEmail: true,
          expectedTransfer: true,
          parsedNotification: true,
        },
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });
}

function buildLookupTransfer(
  company: { id: string; slug: string },
  input: CreateManualVerificationInput,
) {
  const operationAt = dayjs(input.fechaOperacion);
  const expectedWindowFrom = operationAt.subtract(input.toleranciaMinutos, 'minute');
  const expectedWindowTo = operationAt.add(input.toleranciaMinutos, 'minute');
  const now = new Date();

  return {
    id: 'lookup',
    persisted: false,
    transfer: {
      companyId: company.id,
      companySlug: company.slug,
      id: 'lookup',
      referenceExpected: input.referenciaEsperada ?? '',
      amountExpected: input.montoEsperado,
      currency: input.moneda,
      expectedBank: input.bancoEsperado?.trim() || 'Banco no especificado',
      expectedWindowFrom: expectedWindowFrom.toISOString(),
      expectedWindowTo: expectedWindowTo.toISOString(),
      destinationAccountLast4: input.cuentaDestinoUltimos4 ?? null,
      customerName: input.nombreClienteOpcional ?? null,
      notes: input.notas ?? null,
      status: 'pending',
      matchSummary: null,
      confirmedAt: null,
      rejectedAt: null,
      deletedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      matchCount: 0,
    },
    expectedWindowFrom: expectedWindowFrom.toDate(),
    expectedWindowTo: expectedWindowTo.toDate(),
  };
}

function resolveProviderPaymentDate(input: PaymentProviderVerificationInput) {
  if (input.fechaPago) {
    return input.fechaPago;
  }

  return dayjs(input.fechaOperacion).format('YYYY-MM-DD');
}

function buildProviderLookupTransfer(
  company: { id: string; slug: string },
  input: PaymentProviderVerificationInput,
  method: InstapagoVerificationMethod,
) {
  const paymentDate = resolveProviderPaymentDate(input);
  const expectedWindowFrom = dayjs(`${paymentDate}T00:00:00.000Z`);
  const expectedWindowTo = dayjs(`${paymentDate}T23:59:59.999Z`);
  const now = new Date();

  return {
    id: 'lookup',
    persisted: false,
    transfer: {
      companyId: company.id,
      companySlug: company.slug,
      id: 'lookup',
      referenceExpected: input.referenciaEsperada,
      amountExpected: input.montoEsperado,
      currency: input.moneda ?? 'VES',
      expectedBank: paymentProviderBankLabel(method),
      expectedWindowFrom: expectedWindowFrom.toISOString(),
      expectedWindowTo: expectedWindowTo.toISOString(),
      destinationAccountLast4: input.bancoDestino ?? null,
      customerName: input.nombreClienteOpcional ?? input.cedulaCliente ?? null,
      notes: input.notas ?? null,
      status: 'pending',
      matchSummary: null,
      confirmedAt: null,
      rejectedAt: null,
      deletedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      matchCount: 0,
    },
    expectedWindowFrom: expectedWindowFrom.toDate(),
    expectedWindowTo: expectedWindowTo.toDate(),
  };
}

function buildExactAuthorizationSpecFromTransfer(
  transfer: NonNullable<Awaited<ReturnType<typeof loadVerificationTransfer>>>,
): ExactAuthorizationSpec {
  return {
    companyId: transfer.companyId,
    referenceExpected: transfer.referenceExpected,
    customerNameExpected: transfer.customerName,
    amountExpected: Number(transfer.amountExpected),
    currency: transfer.currency,
    expectedWindowFrom: transfer.expectedWindowFrom,
    expectedWindowTo: transfer.expectedWindowTo,
    operationAt: new Date(
      transfer.expectedWindowFrom.getTime() +
        (transfer.expectedWindowTo.getTime() - transfer.expectedWindowFrom.getTime()) / 2,
    ),
  };
}

function readAuthEvaluation(email: VerificationCandidateEmail) {
  return {
    authScore: email.authScore,
    authStatus: email.authenticityStatus.toLowerCase() as 'unknown' | 'low' | 'medium' | 'high',
    riskFlags: Array.isArray(email.authenticityFlags)
      ? (email.authenticityFlags as string[])
      : ((email.authenticityFlags as { riskFlags?: string[] } | null)?.riskFlags ?? []),
    flags:
      ((email.authenticityFlags as { flags?: Record<string, boolean | 'unknown'> } | null)?.flags ??
        {}) as Record<string, boolean | 'unknown'>,
  };
}

function mapLookupStatus(status: 'no_match' | 'possible_match' | 'strong_match' | 'preconfirmed' | 'needs_review') {
  switch (status) {
    case 'preconfirmed':
      return 'preconfirmed';
    case 'needs_review':
      return 'requires_review';
    case 'strong_match':
      return 'match_found';
    case 'possible_match':
      return 'email_received';
    default:
      return 'pending';
  }
}

function buildLookupMatch(
  candidate: ReturnType<typeof evaluateTransferMatches>[number],
  email: VerificationCandidateEmail,
) {
  const now = new Date().toISOString();

  return {
    id: `lookup:${email.id}`,
    inboundEmailId: email.id,
    expectedTransferId: 'lookup',
    parsedNotificationId: email.parsedNotification?.id ?? null,
    score: candidate.score,
    status: candidate.status,
    reasons: candidate.reasons,
    criticalFlags: candidate.criticalFlags,
    preconfirmedAt: candidate.status === 'preconfirmed' ? now : null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
    inboundEmail: null,
    expectedTransfer: null,
    parsedNotification: serializeParsedNotification(email.parsedNotification),
  };
}

function buildLookupCandidate(input: CreateManualVerificationInput, lookup: ReturnType<typeof buildLookupTransfer>) {
  return {
    id: 'lookup',
    referenceExpected: input.referenciaEsperada ?? '',
    amountExpected: input.montoEsperado,
    currency: input.moneda,
    expectedBank: input.bancoEsperado?.trim() || 'Banco no especificado',
    expectedWindowFrom: lookup.expectedWindowFrom,
    expectedWindowTo: lookup.expectedWindowTo,
    destinationAccountLast4: input.cuentaDestinoUltimos4 ?? null,
    customerName: input.nombreClienteOpcional ?? null,
  } satisfies TransferCandidateInput;
}

function evaluateLookupMatches(
  candidateEmails: VerificationCandidateEmail[],
  lookupCandidate: TransferCandidateInput,
) {
  return candidateEmails
    .flatMap((email) => {
      if (!email.parsedNotification) {
        return [];
      }

      const candidate = evaluateTransferMatches(
        {
          parserName: email.parsedNotification.parserName,
          bankName: email.parsedNotification.bankName,
          reference: email.parsedNotification.reference,
          amount: email.parsedNotification.amount ? Number(email.parsedNotification.amount) : null,
          currency: email.parsedNotification.currency ?? null,
          transferAt: email.parsedNotification.transferAt,
          sender: email.parsedNotification.sender,
          subject: email.parsedNotification.subject,
          destinationAccountLast4: email.parsedNotification.destinationAccountLast4,
          originatorName: email.parsedNotification.originatorName,
          confidenceScore: email.parsedNotification.confidenceScore,
          extractedData:
            (email.parsedNotification.extractedData as Record<string, unknown> | null) ?? {},
        },
        readAuthEvaluation(email),
        [lookupCandidate],
      )[0];

      return candidate && candidate.status !== 'no_match' ? [{ candidate, email }] : [];
    })
    .sort((left, right) => {
      if (right.candidate.score !== left.candidate.score) {
        return right.candidate.score - left.candidate.score;
      }

      if (right.email.authScore !== left.email.authScore) {
        return right.email.authScore - left.email.authScore;
      }

      return right.email.receivedAt.getTime() - left.email.receivedAt.getTime();
    });
}

async function loadVerificationCandidatesWithAutoRefresh(
  companySlug: string,
  spec: ExactAuthorizationSpec,
  profile: VerificationFlowProfile = ZELLE_PROFILE,
) {
  if (!hasVerificationIdentity(spec)) {
    return {
      candidateEmails: [] as VerificationCandidateEmail[],
      exact: evaluateExactAuthorization(spec, []),
      autoRefresh: defaultAutoRefreshResult(),
    };
  }

  const initial = await loadVerificationCandidateEmails(spec);
  const initialCandidateEmails = filterCandidatesForProfile(initial.candidateEmails, profile);
  const initialExact = evaluateExactAuthorization(spec, initialCandidateEmails);

  if (initialExact.authorized || initialExact.candidateCount > 0) {
    return {
      candidateEmails: initialCandidateEmails,
      exact: initialExact,
      autoRefresh: defaultAutoRefreshResult(),
    };
  }

  try {
    const pullResult = await pullGmailPubSubMessages(companySlug, env.GMAIL_PUBSUB_PULL_MAX_MESSAGES);

    if (pullResult.pulled === 0 && pullResult.processed === 0) {
      return {
        candidateEmails: initialCandidateEmails,
        exact: initialExact,
        autoRefresh: {
          attempted: true,
          status: 'no_messages',
          pulled: 0,
          processed: 0,
        },
      };
    }

    const refreshed = await loadVerificationCandidateEmails(spec);
    const refreshedCandidateEmails = filterCandidatesForProfile(refreshed.candidateEmails, profile);
    return {
      candidateEmails: refreshedCandidateEmails,
      exact: evaluateExactAuthorization(spec, refreshedCandidateEmails),
      autoRefresh: {
        attempted: true,
        status: 'retried',
        pulled: pullResult.pulled,
        processed: pullResult.processed,
      },
    };
  } catch (error) {
    logger.warn(
      {
        err: error,
        referenceExpected: spec.referenceExpected,
      },
      'Verification request could not auto-refresh Gmail evidence via Pub/Sub',
    );

    return {
      candidateEmails: initialCandidateEmails,
      exact: initialExact,
      autoRefresh: {
        attempted: true,
        status: 'failed',
        pulled: 0,
        processed: 0,
      },
    };
  }
}

async function buildVerificationSummary(
  companySlug: string,
  transfer: NonNullable<Awaited<ReturnType<typeof loadVerificationTransfer>>>,
) {
  const profile = resolveProfileFromExpectedBank(transfer.expectedBank);
  if (profile.method === 'binance') {
    return {
      id: transfer.id,
      persisted: true,
      verificationMethod: 'binance',
      transfer: serializeExpectedTransfer(transfer),
      status: transfer.status.toLowerCase(),
      authorized: false,
      reasonCode:
        transfer.referenceExpected || transfer.customerName ? 'reference' : 'identity_required',
      senderMatchType: 'none',
      candidateCount: 0,
      evidence: null,
      canTreatAsConfirmed: false,
      bestMatch: null,
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: 'unknown',
      riskFlags: ['binance_requires_live_api_lookup'],
      autoRefresh: defaultAutoRefreshResult(),
      matchCount: 0,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
    };
  }

  const spec = buildExactAuthorizationSpecFromTransfer(transfer);
  const { candidateEmails } = await loadVerificationCandidateEmails(spec);
  const filteredCandidateEmails = filterCandidatesForProfile(candidateEmails, profile);
  const exact = evaluateExactAuthorization(spec, filteredCandidateEmails);
  const bestMatch = transfer.matches[0] ?? null;

  return {
    id: transfer.id,
    persisted: true,
    verificationMethod: profile.method,
    transfer: serializeExpectedTransfer(transfer),
    status: transfer.status.toLowerCase(),
    authorized: exact.authorized,
    reasonCode: exact.reasonCode,
    senderMatchType: exact.senderMatchType,
    candidateCount: exact.candidateCount,
    evidence: exact.evidence,
    canTreatAsConfirmed: exact.authorized,
    bestMatch: bestMatch ? serializeTransferMatch(bestMatch) : null,
    strongestEmail: exact.strongestEmail,
    strongestAuthStatus: exact.strongestAuthStatus,
    strongestAuthScore: exact.strongestAuthScore,
    officialSenderMatched: exact.officialSenderMatched,
    riskFlags: exact.riskFlags,
    autoRefresh: defaultAutoRefreshResult(),
    matchCount: transfer.matches.length,
    createdAt: transfer.createdAt,
    updatedAt: transfer.updatedAt,
  };
}

async function createManualVerificationWithProfile(
  companySlug: string,
  rawInput: CreateManualVerificationInput,
  profile: VerificationFlowProfile,
) {
  const input = normalizeInputForProfile(rawInput, profile);
  const operationAt = dayjs(input.fechaOperacion);
  const transfer = await createTransfer(companySlug, {
    referenciaEsperada: input.referenciaEsperada ?? '',
    montoEsperado: input.montoEsperado,
    moneda: input.moneda,
    bancoEsperado: input.bancoEsperado?.trim() || 'Banco no especificado',
    fechaEsperadaDesde: operationAt.subtract(input.toleranciaMinutos, 'minute').toISOString(),
    fechaEsperadaHasta: operationAt.add(input.toleranciaMinutos, 'minute').toISOString(),
    cuentaDestinoUltimos4: input.cuentaDestinoUltimos4 ?? undefined,
    nombreClienteOpcional: input.nombreClienteOpcional ?? undefined,
    notas: input.notas ?? undefined,
  });

  const hydrated = await loadVerificationTransfer(transfer.id);
  if (!hydrated) {
    throw new ApiError(500, 'verification_not_persisted', 'Verification request could not be loaded.');
  }

  return buildVerificationSummary(companySlug, hydrated);
}

async function authorizeVerificationWithProfile(
  companySlug: string,
  rawInput: CreateManualVerificationInput,
  profile: VerificationFlowProfile,
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const input = normalizeInputForProfile(rawInput, profile);
  const spec = buildExactAuthorizationSpec(company.id, input);
  const { exact, autoRefresh } = await loadVerificationCandidatesWithAutoRefresh(companySlug, spec, profile);

  return {
    companyId: company.id,
    companySlug: company.slug,
    verificationMethod: profile.method,
    authorized: exact.authorized,
    reasonCode: exact.reasonCode,
    candidateCount: exact.candidateCount,
    senderMatchType: exact.senderMatchType,
    evidence: exact.evidence,
    autoRefresh,
  };
}

async function lookupVerificationWithProfile(
  companySlug: string,
  rawInput: CreateManualVerificationInput,
  profile: VerificationFlowProfile,
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const input = normalizeInputForProfile(rawInput, profile);
  const lookup = buildLookupTransfer(company, input);
  const lookupCandidate = buildLookupCandidate(input, lookup);
  const spec = buildExactAuthorizationSpec(company.id, input);
  const { candidateEmails, exact, autoRefresh } = await loadVerificationCandidatesWithAutoRefresh(
    companySlug,
    spec,
    profile,
  );
  const evaluated = evaluateLookupMatches(candidateEmails, lookupCandidate);
  const strongest = evaluated[0] ?? null;
  const status = strongest ? mapLookupStatus(strongest.candidate.status) : 'pending';
  const now = new Date().toISOString();

  return {
    id: 'lookup',
    persisted: false,
    verificationMethod: profile.method,
    transfer: {
      ...lookup.transfer,
      status,
      matchSummary: strongest
        ? {
            score: strongest.candidate.score,
            status: strongest.candidate.status,
            criticalFlags: strongest.candidate.criticalFlags,
          }
        : null,
      updatedAt: now,
      matchCount: evaluated.length,
    },
    status,
    authorized: exact.authorized,
    reasonCode: exact.reasonCode,
    senderMatchType: exact.senderMatchType,
    candidateCount: exact.candidateCount,
    evidence: exact.evidence,
    canTreatAsConfirmed: exact.authorized,
    bestMatch: strongest ? buildLookupMatch(strongest.candidate, strongest.email) : null,
    strongestEmail: exact.strongestEmail,
    strongestAuthStatus: exact.strongestAuthStatus,
    strongestAuthScore: exact.strongestAuthScore,
    officialSenderMatched: exact.officialSenderMatched,
    riskFlags: exact.riskFlags,
    autoRefresh,
    matchCount: evaluated.length,
    createdAt: lookup.transfer.createdAt,
    updatedAt: now,
  };
}

export async function createManualVerification(
  companySlug: string,
  input: CreateManualVerificationInput,
) {
  return createManualVerificationWithProfile(companySlug, input, ZELLE_PROFILE);
}

export async function createManualBinanceVerification(
  companySlug: string,
  input: CreateManualVerificationInput,
) {
  return lookupBinanceVerification(companySlug, input);
}

export async function authorizeVerification(
  companySlug: string,
  input: CreateManualVerificationInput,
) {
  return authorizeVerificationWithProfile(companySlug, input, ZELLE_PROFILE);
}

export async function authorizeBinanceVerification(
  companySlug: string,
  input: CreateManualVerificationInput,
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const normalizedInput = normalizeInputForProfile(input, BINANCE_PROFILE);
  const spec = buildExactAuthorizationSpec(company.id, normalizedInput);
  const exact = await evaluateBinancePayAuthorization(spec);

  return {
    companyId: company.id,
    companySlug: company.slug,
    verificationMethod: 'binance',
    authorized: exact.authorized,
    reasonCode: exact.reasonCode,
    candidateCount: exact.candidateCount,
    senderMatchType: exact.senderMatchType,
    evidence: exact.evidence,
    binanceApi: exact.binanceApi,
    autoRefresh: defaultAutoRefreshResult(),
  };
}

async function evaluateProviderVerification(
  companySlug: string,
  input: PaymentProviderVerificationInput,
  method: InstapagoVerificationMethod,
  mode: 'authorize' | 'lookup',
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const exact = await evaluateInstapagoAuthorization({
    companyId: company.id,
    method,
    payload: {
      ...input,
      moneda: input.moneda ?? 'VES',
    },
    mode,
  });

  return {
    companyId: company.id,
    companySlug: company.slug,
    verificationMethod: method,
    authorized: exact.authorized,
    reasonCode: exact.reasonCode,
    candidateCount: exact.candidateCount,
    senderMatchType: exact.senderMatchType,
    evidence: exact.evidence,
    paymentProviderApi: exact.paymentProviderApi,
    autoRefresh: defaultAutoRefreshResult(),
  };
}

async function lookupProviderVerification(
  companySlug: string,
  input: PaymentProviderVerificationInput,
  method: InstapagoVerificationMethod,
  mode: 'authorize' | 'lookup',
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const lookup = buildProviderLookupTransfer(company, { ...input, moneda: input.moneda ?? 'VES' }, method);
  const exact = await evaluateInstapagoAuthorization({
    companyId: company.id,
    method,
    payload: {
      ...input,
      moneda: input.moneda ?? 'VES',
    },
    mode,
  });
  const status = exact.authorized ? 'preconfirmed' : 'pending';
  const now = new Date().toISOString();

  return {
    id: 'lookup',
    persisted: false,
    verificationMethod: method,
    transfer: {
      ...lookup.transfer,
      status,
      matchSummary: exact.authorized
        ? {
            score: exact.strongestAuthScore ?? 100,
            status: 'preconfirmed',
            criticalFlags: [],
          }
        : null,
      updatedAt: now,
      matchCount: exact.authorized ? 1 : 0,
    },
    status,
    authorized: exact.authorized,
    reasonCode: exact.reasonCode,
    senderMatchType: exact.senderMatchType,
    candidateCount: exact.candidateCount,
    evidence: exact.evidence,
    paymentProviderApi: exact.paymentProviderApi,
    canTreatAsConfirmed: exact.authorized,
    bestMatch: null,
    strongestEmail: null,
    strongestAuthStatus: exact.strongestAuthStatus,
    strongestAuthScore: exact.strongestAuthScore,
    officialSenderMatched: exact.officialSenderMatched,
    riskFlags: exact.riskFlags,
    autoRefresh: defaultAutoRefreshResult(),
    matchCount: exact.authorized ? 1 : 0,
    createdAt: lookup.transfer.createdAt,
    updatedAt: now,
  };
}

export async function authorizePagoMovilVerification(
  companySlug: string,
  input: PaymentProviderVerificationInput,
) {
  return evaluateProviderVerification(companySlug, input, 'pago_movil', 'authorize');
}

export async function authorizeTransferenciaDirectaVerification(
  companySlug: string,
  input: PaymentProviderVerificationInput,
) {
  return evaluateProviderVerification(companySlug, input, 'transferencia_directa', 'authorize');
}

export async function lookupPagoMovilVerification(
  companySlug: string,
  input: PaymentProviderVerificationInput,
) {
  return lookupProviderVerification(companySlug, input, 'pago_movil', 'lookup');
}

export async function lookupTransferenciaDirectaVerification(
  companySlug: string,
  input: PaymentProviderVerificationInput,
) {
  return lookupProviderVerification(companySlug, input, 'transferencia_directa', 'lookup');
}

export async function operatorLookupPagoMovilVerification(
  companySlug: string,
  input: PaymentProviderVerificationInput,
) {
  return lookupProviderVerification(companySlug, input, 'pago_movil', 'authorize');
}

export async function operatorLookupTransferenciaDirectaVerification(
  companySlug: string,
  input: PaymentProviderVerificationInput,
) {
  return lookupProviderVerification(companySlug, input, 'transferencia_directa', 'authorize');
}

export async function createManualPagoMovilVerification(
  companySlug: string,
  input: PaymentProviderVerificationInput,
) {
  return operatorLookupPagoMovilVerification(companySlug, input);
}

export async function createManualTransferenciaDirectaVerification(
  companySlug: string,
  input: PaymentProviderVerificationInput,
) {
  return operatorLookupTransferenciaDirectaVerification(companySlug, input);
}

export async function lookupVerification(
  companySlug: string,
  input: CreateManualVerificationInput,
) {
  return lookupVerificationWithProfile(companySlug, input, ZELLE_PROFILE);
}

export async function lookupBinanceVerification(
  companySlug: string,
  input: CreateManualVerificationInput,
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const normalizedInput = normalizeInputForProfile(input, BINANCE_PROFILE);
  const lookup = buildLookupTransfer(company, normalizedInput);
  const spec = buildExactAuthorizationSpec(company.id, normalizedInput);
  const exact = await evaluateBinancePayAuthorization(spec);
  const status = exact.authorized ? 'preconfirmed' : 'pending';
  const now = new Date().toISOString();

  return {
    id: 'lookup',
    persisted: false,
    verificationMethod: 'binance',
    transfer: {
      ...lookup.transfer,
      expectedBank: 'Binance',
      status,
      matchSummary: exact.authorized
        ? {
            score: exact.strongestAuthScore ?? 100,
            status: 'preconfirmed',
            criticalFlags: [],
          }
        : null,
      updatedAt: now,
      matchCount: exact.authorized ? 1 : 0,
    },
    status,
    authorized: exact.authorized,
    reasonCode: exact.reasonCode,
    senderMatchType: exact.senderMatchType,
    candidateCount: exact.candidateCount,
    evidence: exact.evidence,
    binanceApi: exact.binanceApi,
    canTreatAsConfirmed: exact.authorized,
    bestMatch: null,
    strongestEmail: null,
    strongestAuthStatus: exact.strongestAuthStatus,
    strongestAuthScore: exact.strongestAuthScore,
    officialSenderMatched: exact.officialSenderMatched,
    riskFlags: exact.riskFlags,
    autoRefresh: defaultAutoRefreshResult(),
    matchCount: exact.authorized ? 1 : 0,
    createdAt: lookup.transfer.createdAt,
    updatedAt: now,
  };
}

export async function listVerifications(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const items = await prisma.expectedTransfer.findMany({
    where: {
      companyId: company.id,
      deletedAt: null,
    },
    include: {
      company: true,
      matches: {
        include: {
          inboundEmail: true,
          expectedTransfer: true,
          parsedNotification: true,
        },
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 25,
  });

  return Promise.all(items.map((item) => buildVerificationSummary(companySlug, item)));
}

export async function getVerificationById(companySlug: string, id: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const transfer = await prisma.expectedTransfer.findFirst({
    where: {
      id,
      companyId: company.id,
    },
    include: {
      company: true,
      matches: {
        include: {
          inboundEmail: true,
          expectedTransfer: true,
          parsedNotification: true,
        },
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });

  if (!transfer || transfer.deletedAt) {
    throw new ApiError(404, 'verification_not_found', 'Verification request not found.');
  }

  return buildVerificationSummary(companySlug, transfer);
}

export async function confirmVerification(companySlug: string, id: string, note?: string) {
  await confirmTransfer(companySlug, id, note);
  return getVerificationById(companySlug, id);
}

export async function rejectVerification(companySlug: string, id: string, note?: string) {
  await rejectTransfer(companySlug, id, note);
  return getVerificationById(companySlug, id);
}
