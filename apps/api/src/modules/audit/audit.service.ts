import { prisma } from '../../lib/prisma';
import { serializeAuditLog } from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';

export async function listAuditTrail(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const logs = await prisma.auditLog.findMany({
    where: {
      companyId: company.id,
    },
    include: {
      company: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 100,
  });

  return logs.map(serializeAuditLog);
}
