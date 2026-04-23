import type {
  CreateExpectedTransferInput,
  UpdateExpectedTransferInput,
} from '@ledgerlink/shared';

import { writeAuditLog } from '../../lib/audit';
import { ApiError } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { TransferEvidenceStatus } from '../../lib/prisma-runtime';
import { serializeExpectedTransfer } from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';
import { syncMatchesForTransfer } from '../matches/matching.service';

export async function listTransfers(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const transfers = await prisma.expectedTransfer.findMany({
    where: {
      companyId: company.id,
      deletedAt: null,
    },
    include: {
      company: true,
      matches: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return transfers.map(serializeExpectedTransfer);
}

export async function createTransfer(companySlug: string, input: CreateExpectedTransferInput) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const transfer = await prisma.expectedTransfer.create({
    data: {
      companyId: company.id,
      referenceExpected: input.referenciaEsperada,
      amountExpected: input.montoEsperado,
      currency: input.moneda,
      expectedBank: input.bancoEsperado,
      expectedWindowFrom: new Date(input.fechaEsperadaDesde),
      expectedWindowTo: new Date(input.fechaEsperadaHasta),
      destinationAccountLast4: input.cuentaDestinoUltimos4 ?? undefined,
      customerName: input.nombreClienteOpcional ?? undefined,
      notes: input.notas ?? undefined,
    },
    include: {
      company: true,
      matches: true,
    },
  });

  await writeAuditLog({
    companyId: company.id,
    actorType: 'USER',
    action: 'transfer.created',
    entityType: 'ExpectedTransfer',
    entityId: transfer.id,
    after: {
      referenceExpected: transfer.referenceExpected,
    },
  });

  await syncMatchesForTransfer(company.id, transfer.id);

  const refreshed = await prisma.expectedTransfer.findUnique({
    where: { id: transfer.id },
    include: {
      company: true,
      matches: true,
    },
  });

  return serializeExpectedTransfer(refreshed ?? transfer);
}

export async function getTransferById(companySlug: string, id: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const transfer = await prisma.expectedTransfer.findFirst({
    where: { id, companyId: company.id },
    include: {
      company: true,
      matches: true,
    },
  });

  if (!transfer || transfer.deletedAt) {
    throw new ApiError(404, 'transfer_not_found', 'Expected transfer not found.');
  }

  return serializeExpectedTransfer(transfer);
}

export async function updateTransfer(
  companySlug: string,
  id: string,
  input: UpdateExpectedTransferInput,
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const existing = await prisma.expectedTransfer.findFirst({
    where: { id, companyId: company.id },
    include: {
      company: true,
    },
  });
  if (!existing || existing.deletedAt) {
    throw new ApiError(404, 'transfer_not_found', 'Expected transfer not found.');
  }

  const transfer = await prisma.expectedTransfer.update({
    where: { id },
    data: {
      referenceExpected: input.referenciaEsperada ?? undefined,
      amountExpected: input.montoEsperado ?? undefined,
      currency: input.moneda ?? undefined,
      expectedBank: input.bancoEsperado ?? undefined,
      expectedWindowFrom: input.fechaEsperadaDesde ? new Date(input.fechaEsperadaDesde) : undefined,
      expectedWindowTo: input.fechaEsperadaHasta ? new Date(input.fechaEsperadaHasta) : undefined,
      destinationAccountLast4: input.cuentaDestinoUltimos4 ?? undefined,
      customerName: input.nombreClienteOpcional ?? undefined,
      notes: input.notas ?? undefined,
      status: input.status ? (input.status.toUpperCase() as TransferEvidenceStatus) : undefined,
    },
    include: {
      company: true,
      matches: true,
    },
  });

  await writeAuditLog({
    companyId: company.id,
    actorType: 'USER',
    action: 'transfer.updated',
    entityType: 'ExpectedTransfer',
    entityId: transfer.id,
    before: existing,
    after: transfer,
  });

  await syncMatchesForTransfer(company.id, transfer.id);
  return serializeExpectedTransfer(transfer);
}

export async function confirmTransfer(companySlug: string, id: string, note?: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const existing = await prisma.expectedTransfer.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!existing) {
    throw new ApiError(404, 'transfer_not_found', 'Expected transfer not found.');
  }

  const transfer = await prisma.expectedTransfer.update({
    where: { id },
    data: {
      status: TransferEvidenceStatus.CONFIRMED_MANUAL,
      confirmedAt: new Date(),
      notes: note ?? undefined,
    },
    include: {
      company: true,
      matches: true,
    },
  });

  await writeAuditLog({
    companyId: company.id,
    actorType: 'USER',
    action: 'transfer.confirmed_manual',
    entityType: 'ExpectedTransfer',
    entityId: transfer.id,
    after: {
      status: transfer.status,
      note,
    },
  });

  return serializeExpectedTransfer(transfer);
}

export async function rejectTransfer(companySlug: string, id: string, note?: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const existing = await prisma.expectedTransfer.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!existing) {
    throw new ApiError(404, 'transfer_not_found', 'Expected transfer not found.');
  }

  const transfer = await prisma.expectedTransfer.update({
    where: { id },
    data: {
      status: TransferEvidenceStatus.REJECTED,
      rejectedAt: new Date(),
      notes: note ?? undefined,
    },
    include: {
      company: true,
      matches: true,
    },
  });

  await writeAuditLog({
    companyId: company.id,
    actorType: 'USER',
    action: 'transfer.rejected',
    entityType: 'ExpectedTransfer',
    entityId: transfer.id,
    after: {
      status: transfer.status,
      note,
    },
  });

  return serializeExpectedTransfer(transfer);
}
