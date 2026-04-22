import { prisma } from '../../lib/prisma';
import { serializeManualReview } from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';

export async function listManualReviews(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const reviews = await prisma.manualReview.findMany({
    where: {
      companyId: company.id,
    },
    include: {
      company: true,
      inboundEmail: true,
      expectedTransfer: true,
      transferMatch: true,
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  return reviews.map(serializeManualReview);
}
