import { prisma } from '../../lib/prisma';
import { MatchStatus, ManualReviewStatus, TransferEvidenceStatus } from '../../lib/prisma-runtime';
import { serializeAuditLog, serializeGmailAccount } from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';
import { buildWatchHealthSummary } from '../gmail/gmail.service';

export async function getDashboardSummary(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const [gmailAccounts, emailCount, pendingTransfers, strongMatches, reviews, recentActivity] =
    await Promise.all([
      prisma.gmailAccount.findMany({
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
        orderBy: [{ connectedAt: 'asc' }, { email: 'asc' }],
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

  const serializedAccounts = gmailAccounts.map(serializeGmailAccount);
  const firstAccount = serializedAccounts[0] ?? null;

  return {
    companyId: company.id,
    companySlug: company.slug,
    gmailConnected: serializedAccounts.some((account) => account.hasToken),
    connectedInboxCount: serializedAccounts.filter((account) => account.hasToken).length,
    gmailAccounts: serializedAccounts,
    gmailAccount: firstAccount,
    watchStatus: firstAccount?.watch ?? null,
    watchHealthSummary: buildWatchHealthSummary(gmailAccounts),
    counters: {
      processedEmails: emailCount,
      pendingTransfers,
      strongMatches,
      manualReviews: reviews,
    },
    recentActivity: recentActivity.map(serializeAuditLog),
  };
}
