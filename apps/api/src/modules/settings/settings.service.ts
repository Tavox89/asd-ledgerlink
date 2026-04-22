import type {
  CreateAllowedBankSenderInput,
  UpdateAllowedBankSenderInput,
} from '@ledgerlink/shared';

import { writeAuditLog } from '../../lib/audit';
import { ApiError } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { serializeAllowedBankSender } from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';
import { reprocessStoredEmailsMatchingAllowedSender } from '../email-processing/ingestion.service';

export async function listAllowedBankSenders(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const senders = await prisma.allowedBankSender.findMany({
    where: {
      companyId: company.id,
    },
    include: {
      company: true,
    },
    orderBy: [{ isActive: 'desc' }, { bankName: 'asc' }],
  });

  return senders.map(serializeAllowedBankSender);
}

export async function createAllowedBankSender(companySlug: string, input: CreateAllowedBankSenderInput) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const sender = await prisma.allowedBankSender.create({
    data: {
      companyId: company.id,
      ...input,
    },
    include: {
      company: true,
    },
  });

  const reprocessSummary = sender.isActive
    ? await reprocessStoredEmailsMatchingAllowedSender(sender)
    : { scanned: 0, reprocessed: 0 };

  await writeAuditLog({
    companyId: company.id,
    actorType: 'USER',
    action: 'allowed_sender.created',
    entityType: 'AllowedBankSender',
    entityId: sender.id,
    after: sender,
    metadata: {
      reprocessScanCount: reprocessSummary.scanned,
      reprocessedIgnoredEmails: reprocessSummary.reprocessed,
    },
  });

  return serializeAllowedBankSender(sender);
}

export async function updateAllowedBankSender(
  companySlug: string,
  id: string,
  input: UpdateAllowedBankSenderInput,
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const existing = await prisma.allowedBankSender.findFirst({
    where: { id, companyId: company.id },
    include: {
      company: true,
    },
  });
  if (!existing) {
    throw new ApiError(404, 'allowed_sender_not_found', 'Allowed bank sender not found.');
  }

  const sender = await prisma.allowedBankSender.update({
    where: { id },
    data: input,
    include: {
      company: true,
    },
  });

  const reprocessSummary = sender.isActive
    ? await reprocessStoredEmailsMatchingAllowedSender(sender)
    : { scanned: 0, reprocessed: 0 };

  await writeAuditLog({
    companyId: company.id,
    actorType: 'USER',
    action: 'allowed_sender.updated',
    entityType: 'AllowedBankSender',
    entityId: sender.id,
    before: existing,
    after: sender,
    metadata: {
      reprocessScanCount: reprocessSummary.scanned,
      reprocessedIgnoredEmails: reprocessSummary.reprocessed,
    },
  });

  return serializeAllowedBankSender(sender);
}
