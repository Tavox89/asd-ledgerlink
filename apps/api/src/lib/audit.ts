import type { ActorType } from '@prisma/client';

import { prisma } from './prisma';

export async function writeAuditLog(input: {
  companyId?: string | null;
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}) {
  const company =
    input.companyId ??
    (
      await prisma.companyProfile.findFirst({
        where: {
          OR: [{ isDefault: true }, { slug: 'default' }],
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
        },
      })
    )?.id;

  if (!company) {
    throw new Error('Cannot write audit log before a company profile exists.');
  }

  return prisma.auditLog.create({
    data: {
      companyId: company,
      actorType: input.actorType,
      actorId: input.actorId ?? undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before as never,
      after: input.after as never,
      metadata: input.metadata as never,
    },
  });
}
