import { prisma } from '../../lib/prisma';
import { MatchStatus, ManualReviewStatus, TransferEvidenceStatus } from '../../lib/prisma-runtime';
import { serializeAuditLog } from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';

export async function getDashboardSummary(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const [gmailAccount, emailCount, pendingTransfers, strongMatches, reviews, recentActivity] =
    await Promise.all([
      prisma.gmailAccount.findFirst({
        where: {
          companyId: company.id,
        },
        include: {
          company: true,
          token: true,
          watches: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.inboundEmail.count({
        where: {
          companyId: company.id,
        },
      }),
      prisma.expectedTransfer.count({
        where: {
          companyId: company.id,
          deletedAt: null,
          status: {
            notIn: [TransferEvidenceStatus.CONFIRMED_MANUAL, TransferEvidenceStatus.REJECTED],
          },
        },
      }),
      prisma.transferMatch.count({
        where: {
          companyId: company.id,
          status: {
            in: [MatchStatus.STRONG_MATCH, MatchStatus.PRECONFIRMED],
          },
        },
      }),
      prisma.manualReview.count({
        where: {
          companyId: company.id,
          status: ManualReviewStatus.OPEN,
        },
      }),
      prisma.auditLog.findMany({
        where: {
          companyId: company.id,
        },
        include: {
          company: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

  return {
    companyId: company.id,
    companySlug: company.slug,
    gmailConnected: Boolean(gmailAccount?.token),
    gmailAccount: gmailAccount
      ? {
          email: gmailAccount.email,
          displayName: gmailAccount.displayName,
        }
      : null,
    watchStatus: gmailAccount?.watches[0]
      ? {
          status: gmailAccount.watches[0].status.toLowerCase(),
          expirationAt: gmailAccount.watches[0].expirationAt,
          historyId: gmailAccount.watches[0].historyId,
        }
      : null,
    counters: {
      processedEmails: emailCount,
      pendingTransfers,
      strongMatches,
      manualReviews: reviews,
    },
    recentActivity: recentActivity.map(serializeAuditLog),
  };
}
