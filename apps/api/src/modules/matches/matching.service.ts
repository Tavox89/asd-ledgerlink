import type { ReviewMatchInput } from '@ledgerlink/shared';

import { writeAuditLog } from '../../lib/audit';
import { ApiError } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { InboundEmailStatus, MatchStatus, TransferEvidenceStatus } from '../../lib/prisma-runtime';
import { serializeTransferMatch } from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';
import { evaluateTransferMatches, mapTransferCandidate } from './matching.engine';

function toDbMatchStatus(
  status: 'no_match' | 'possible_match' | 'strong_match' | 'preconfirmed' | 'needs_review',
) {
  switch (status) {
    case 'possible_match':
      return MatchStatus.POSSIBLE_MATCH;
    case 'strong_match':
      return MatchStatus.STRONG_MATCH;
    case 'preconfirmed':
      return MatchStatus.PRECONFIRMED;
    case 'needs_review':
      return MatchStatus.NEEDS_REVIEW;
    default:
      return MatchStatus.NO_MATCH;
  }
}

function resolveTransferStatusFromMatch(status: MatchStatus) {
  switch (status) {
    case MatchStatus.PRECONFIRMED:
      return TransferEvidenceStatus.PRECONFIRMED;
    case MatchStatus.NEEDS_REVIEW:
      return TransferEvidenceStatus.REQUIRES_REVIEW;
    case MatchStatus.STRONG_MATCH:
      return TransferEvidenceStatus.MATCH_FOUND;
    default:
      return TransferEvidenceStatus.PENDING;
  }
}

async function recomputeTransferStatus(companyId: string, expectedTransferId: string) {
  const transfer = await prisma.expectedTransfer.findFirst({
    where: { id: expectedTransferId, companyId },
  });

  if (
    !transfer ||
    transfer.deletedAt ||
    [TransferEvidenceStatus.CONFIRMED_MANUAL, TransferEvidenceStatus.REJECTED].includes(transfer.status)
  ) {
    return;
  }

  const bestMatch = await prisma.transferMatch.findFirst({
    where: {
      companyId,
      expectedTransferId,
    },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
  });

  await prisma.expectedTransfer.update({
    where: { id: expectedTransferId },
    data: bestMatch
      ? {
          status: resolveTransferStatusFromMatch(bestMatch.status),
          matchSummary: {
            score: bestMatch.score,
            status: bestMatch.status.toLowerCase(),
          },
        }
      : {
          status: TransferEvidenceStatus.PENDING,
          matchSummary: null,
        },
  });
}

async function deleteExistingMatchesForInboundEmail(companyId: string, inboundEmailId: string) {
  const affectedTransferIds = new Set<string>();
  const existingMatches = await prisma.transferMatch.findMany({
    where: {
      companyId,
      inboundEmailId,
    },
    select: {
      id: true,
      expectedTransferId: true,
    },
  });

  if (existingMatches.length === 0) {
    return affectedTransferIds;
  }

  for (const match of existingMatches) {
    affectedTransferIds.add(match.expectedTransferId);
  }

  await prisma.manualReview.deleteMany({
    where: {
      companyId,
      transferMatchId: {
        in: existingMatches.map((match) => match.id),
      },
    },
  });

  await prisma.transferMatch.deleteMany({
    where: {
      companyId,
      inboundEmailId,
    },
  });

  return affectedTransferIds;
}

async function getMatchForCompanyOrThrow(companySlug: string, id: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const match = await prisma.transferMatch.findFirst({
    where: {
      id,
      companyId: company.id,
    },
    include: {
      company: true,
      inboundEmail: true,
      expectedTransfer: true,
      parsedNotification: true,
    },
  });

  if (!match) {
    throw new ApiError(404, 'match_not_found', 'Transfer match not found.');
  }

  return { company, match };
}

export async function clearMatchesForInboundEmail(companyId: string, inboundEmailId: string) {
  const affectedTransferIds = await deleteExistingMatchesForInboundEmail(companyId, inboundEmailId);

  await Promise.all(
    [...affectedTransferIds].map((transferId) => recomputeTransferStatus(companyId, transferId)),
  );
}

export async function syncMatchesForInboundEmail(companyId: string, inboundEmailId: string) {
  const email = await prisma.inboundEmail.findFirst({
    where: { id: inboundEmailId, companyId },
    include: {
      company: true,
      parsedNotification: true,
      matches: true,
    },
  });

  if (!email || !email.parsedNotification || email.senderMatchType === 'NONE') {
    return [];
  }

  const transfers = await prisma.expectedTransfer.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: {
        notIn: [TransferEvidenceStatus.REJECTED, TransferEvidenceStatus.CONFIRMED_MANUAL],
      },
    },
  });

  const authEvaluation = {
    authScore: email.authScore,
    authStatus: email.authenticityStatus.toLowerCase() as 'unknown' | 'low' | 'medium' | 'high',
    riskFlags: Array.isArray(email.authenticityFlags)
      ? (email.authenticityFlags as string[])
      : ((email.authenticityFlags as { riskFlags?: string[] } | null)?.riskFlags ?? []),
    flags:
      ((email.authenticityFlags as { flags?: Record<string, boolean | 'unknown'> } | null)?.flags ??
        {}) as Record<string, boolean | 'unknown'>,
  };

  const candidates = evaluateTransferMatches(
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
      extractedData: (email.parsedNotification.extractedData as Record<string, unknown>) ?? {},
    },
    authEvaluation,
    transfers.map(mapTransferCandidate),
  );
  const affectedTransferIds = new Set<string>();

  const clearedTransferIds = await deleteExistingMatchesForInboundEmail(companyId, inboundEmailId);
  for (const transferId of clearedTransferIds) {
    affectedTransferIds.add(transferId);
  }

  const meaningfulCandidates = candidates.filter((candidate) => candidate.status !== 'no_match');

  for (const candidate of meaningfulCandidates) {
    affectedTransferIds.add(candidate.expectedTransferId);
  }

  const persisted = [];
  for (const candidate of meaningfulCandidates) {
    const match = await prisma.transferMatch.create({
      data: {
        companyId,
        inboundEmailId,
        expectedTransferId: candidate.expectedTransferId,
        parsedNotificationId: email.parsedNotification.id,
        score: candidate.score,
        status: toDbMatchStatus(candidate.status),
        reasons: candidate.reasons as never,
        criticalFlags: candidate.criticalFlags as never,
        preconfirmedAt: candidate.status === 'preconfirmed' ? new Date() : null,
      },
      include: {
        company: true,
        inboundEmail: true,
        expectedTransfer: true,
        parsedNotification: true,
      },
    });

    await prisma.expectedTransfer.update({
      where: { id: candidate.expectedTransferId },
      data: {
        status: resolveTransferStatusFromMatch(match.status),
        matchSummary: {
          score: candidate.score,
          status: candidate.status,
          criticalFlags: candidate.criticalFlags,
        },
      },
    });

    if (candidate.status === 'needs_review') {
      await prisma.manualReview.create({
        data: {
          companyId,
          transferMatchId: match.id,
          expectedTransferId: match.expectedTransferId,
          inboundEmailId,
          status: 'OPEN',
          notes: 'Match fuerte con ambiguedad o flags criticos',
        },
      });
    }

    await writeAuditLog({
      companyId,
      actorType: 'SYSTEM',
      action: 'match.generated',
      entityType: 'TransferMatch',
      entityId: match.id,
      after: {
        score: candidate.score,
        status: candidate.status,
      },
      metadata: {
        inboundEmailId,
      },
    });

    persisted.push(serializeTransferMatch(match));
  }

  await prisma.inboundEmail.update({
    where: { id: inboundEmailId },
    data: {
      processingStatus:
        meaningfulCandidates.length === 0
          ? InboundEmailStatus.PARSED
          : meaningfulCandidates.some((candidate) => candidate.status === 'needs_review')
            ? InboundEmailStatus.NEEDS_REVIEW
            : InboundEmailStatus.MATCHED,
      matchedAt: meaningfulCandidates.length > 0 ? new Date() : null,
    },
  });

  await Promise.all(
    [...affectedTransferIds].map((transferId) => recomputeTransferStatus(companyId, transferId)),
  );

  return persisted;
}

export async function syncMatchesForTransfer(companyId: string, expectedTransferId: string) {
  const transfer = await prisma.expectedTransfer.findFirst({
    where: { id: expectedTransferId, companyId },
  });

  if (!transfer) {
    return [];
  }

  const emails = await prisma.inboundEmail.findMany({
    where: {
      companyId,
      parsedNotification: {
        isNot: null,
      },
      senderMatchType: {
        not: 'NONE',
      },
    },
    include: {
      parsedNotification: true,
    },
  });

  for (const email of emails) {
    await syncMatchesForInboundEmail(companyId, email.id);
  }

  return prisma.transferMatch.findMany({
    where: {
      companyId,
      expectedTransferId,
    },
    include: {
      company: true,
      inboundEmail: true,
      expectedTransfer: true,
      parsedNotification: true,
    },
    orderBy: {
      score: 'desc',
    },
  });
}

export async function listMatches(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const matches = await prisma.transferMatch.findMany({
    where: {
      companyId: company.id,
    },
    include: {
      company: true,
      inboundEmail: true,
      expectedTransfer: true,
      parsedNotification: true,
    },
    orderBy: [{ status: 'asc' }, { score: 'desc' }],
  });

  return matches.map(serializeTransferMatch);
}

export async function getMatchById(companySlug: string, id: string) {
  const { match } = await getMatchForCompanyOrThrow(companySlug, id);
  return serializeTransferMatch(match);
}

export async function preconfirmMatch(companySlug: string, id: string, note?: string) {
  const { company, match: existing } = await getMatchForCompanyOrThrow(companySlug, id);
  const match = await prisma.transferMatch.update({
    where: { id },
    data: {
      status: MatchStatus.PRECONFIRMED,
      preconfirmedAt: new Date(),
    },
    include: {
      company: true,
      inboundEmail: true,
      expectedTransfer: true,
      parsedNotification: true,
    },
  });

  await prisma.expectedTransfer.update({
    where: { id: match.expectedTransferId },
    data: {
      status: TransferEvidenceStatus.PRECONFIRMED,
      matchSummary: {
        score: match.score,
        status: 'preconfirmed',
        note,
      },
    },
  });

  await writeAuditLog({
    companyId: company.id,
    actorType: 'USER',
    action: 'match.preconfirmed',
    entityType: 'TransferMatch',
    entityId: match.id,
    before: existing,
    after: {
      status: match.status,
      note,
    },
  });

  return serializeTransferMatch(match);
}

export async function reviewMatch(companySlug: string, id: string, input: ReviewMatchInput) {
  if (input.decision === 'preconfirm') {
    return preconfirmMatch(companySlug, id, input.reviewNotes);
  }

  const { company, match: existing } = await getMatchForCompanyOrThrow(companySlug, id);
  const match = await prisma.transferMatch.update({
    where: { id },
    data: {
      status: input.decision === 'reject' ? MatchStatus.REJECTED : MatchStatus.NEEDS_REVIEW,
      reviewedAt: new Date(),
    },
    include: {
      company: true,
      inboundEmail: true,
      expectedTransfer: true,
      parsedNotification: true,
    },
  });

  await prisma.manualReview.create({
    data: {
      companyId: company.id,
      transferMatchId: match.id,
      expectedTransferId: match.expectedTransferId,
      inboundEmailId: match.inboundEmailId,
      status: 'OPEN',
      notes: input.reviewNotes,
    },
  });

  await prisma.expectedTransfer.update({
    where: { id: match.expectedTransferId },
    data: {
      status: TransferEvidenceStatus.REQUIRES_REVIEW,
    },
  });

  await writeAuditLog({
    companyId: company.id,
    actorType: 'USER',
    action: 'match.reviewed',
    entityType: 'TransferMatch',
    entityId: match.id,
    before: existing,
    after: {
      decision: input.decision,
      reviewNotes: input.reviewNotes,
    },
  });

  return serializeTransferMatch(match);
}

export async function rejectMatch(companySlug: string, id: string, note?: string) {
  const { company, match: existing } = await getMatchForCompanyOrThrow(companySlug, id);
  const match = await prisma.transferMatch.update({
    where: { id },
    data: {
      status: MatchStatus.REJECTED,
      reviewedAt: new Date(),
    },
    include: {
      company: true,
      inboundEmail: true,
      expectedTransfer: true,
      parsedNotification: true,
    },
  });

  await prisma.expectedTransfer.update({
    where: { id: match.expectedTransferId },
    data: {
      status: TransferEvidenceStatus.REQUIRES_REVIEW,
    },
  });

  await writeAuditLog({
    companyId: company.id,
    actorType: 'USER',
    action: 'match.rejected',
    entityType: 'TransferMatch',
    entityId: match.id,
    before: existing,
    after: {
      note,
    },
  });

  return serializeTransferMatch(match);
}
