import type {
  CreateManualVerificationInput,
  PaymentProviderVerificationInput,
  ValidationContextInput,
} from '@ledgerlink/shared';

import { ApiError } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import {
  ActorType,
  PaymentConsumptionStatus,
  PaymentValidationChannel,
  PaymentValidationMethod,
  PaymentValidationRecordStatus,
} from '../../lib/prisma-runtime';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';
import type { VerificationMethod } from '../verifications/verifications.service';

type VerificationInput = CreateManualVerificationInput | PaymentProviderVerificationInput;

type AuthorizationResult = {
  companyId: string;
  companySlug: string;
  verificationMethod: VerificationMethod;
  authorized: boolean;
  reasonCode: string;
  candidateCount: number;
  evidence?: unknown;
  binanceApi?: unknown;
  paymentProviderApi?: unknown;
  [key: string]: unknown;
};

type ConsumptionStatus = 'not_consumed' | 'consumed' | 'idempotent' | 'duplicate';

type ConsumptionResponse = {
  status: ConsumptionStatus;
  paymentId?: string;
  idempotent?: boolean;
  orderNumber?: string | null;
  cashierId?: string | null;
  cashierName?: string | null;
  channel?: string | null;
  consumedAt?: Date | string | null;
  previous?: {
    paymentId: string;
    orderNumber?: string | null;
    cashierId?: string | null;
    cashierName?: string | null;
    channel?: string | null;
    consumedAt?: Date | string | null;
  };
};

function compactString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function toJsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as object | null;
}

function normalizeReference(value: unknown) {
  return compactString(value)?.replace(/\s+/g, '').toLowerCase() ?? null;
}

function normalizeAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  if (typeof value === 'string') {
    const normalized = Number(value.replace(',', '.'));
    return Number.isFinite(normalized) ? normalized.toFixed(2) : null;
  }

  return null;
}

function dateOnlyFromInput(input: VerificationInput) {
  if ('fechaPago' in input && input.fechaPago) {
    return input.fechaPago;
  }

  const value = compactString(input.fechaOperacion);
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function operationDateFromInput(input: VerificationInput) {
  const dateOnly = dateOnlyFromInput(input);
  if (dateOnly) {
    return new Date(`${dateOnly}T12:00:00.000Z`);
  }

  return null;
}

function channelFromContext(context: ValidationContextInput | undefined) {
  switch (context?.source) {
    case 'whatsapp':
      return PaymentValidationChannel.WHATSAPP;
    case 'openpos':
      return PaymentValidationChannel.OPENPOS;
    case 'operator':
      return PaymentValidationChannel.OPERATOR;
    case 'system':
      return PaymentValidationChannel.SYSTEM;
    default:
      return PaymentValidationChannel.API;
  }
}

function methodToEnum(method: VerificationMethod) {
  switch (method) {
    case 'binance':
      return PaymentValidationMethod.BINANCE;
    case 'pago_movil':
      return PaymentValidationMethod.PAGO_MOVIL;
    case 'transferencia_directa':
      return PaymentValidationMethod.TRANSFERENCIA_DIRECTA;
    default:
      return PaymentValidationMethod.ZELLE;
  }
}

function sourceLabel(channel: PaymentValidationChannel) {
  return channel.toLowerCase();
}

function enumLabel(value: string) {
  return value.toLowerCase();
}

function externalRequestIdFromInput(input: VerificationInput) {
  const contextExternal = compactString(input.validationContext?.externalRequestId);
  if (contextExternal) {
    return contextExternal;
  }

  return 'externalRequestId' in input ? compactString(input.externalRequestId) : null;
}

function requireConsumptionContext(context: ValidationContextInput | undefined) {
  const channel = channelFromContext(context);
  if (
    channel === PaymentValidationChannel.WHATSAPP ||
    channel === PaymentValidationChannel.OPERATOR ||
    channel === PaymentValidationChannel.SYSTEM
  ) {
    return;
  }

  if (!compactString(context?.orderNumber) || !(compactString(context?.cashierId) || compactString(context?.cashierName))) {
    throw new ApiError(
      400,
      'validation_context_required',
      'Authorize requests from POS/API must include validationContext.orderNumber and cashierId or cashierName.',
    );
  }
}

export function assertAuthorizeConsumptionContext(input: VerificationInput) {
  requireConsumptionContext(input.validationContext);
}

function binanceMatchedReference(result: AuthorizationResult, input: VerificationInput) {
  const binanceApi = result.binanceApi as
    | {
        matchedTransactionId?: unknown;
        evidence?: { transactionId?: unknown; orderId?: unknown; reference?: unknown } | null;
      }
    | undefined;

  return (
    normalizeReference(binanceApi?.matchedTransactionId) ??
    normalizeReference(binanceApi?.evidence?.orderId) ??
    normalizeReference(binanceApi?.evidence?.transactionId) ??
    normalizeReference(input.referenciaEsperada)
  );
}

function buildPaymentFingerprint(method: VerificationMethod, input: VerificationInput, result: AuthorizationResult) {
  const reference = normalizeReference(input.referenciaEsperada);
  const amount = normalizeAmount(input.montoEsperado);
  const currency = compactString(input.moneda)?.toUpperCase() ?? null;
  const date = dateOnlyFromInput(input);

  if (method === 'zelle') {
    if (reference) {
      return `zelle:ref:${reference}`;
    }

    const evidence = result.evidence as { gmailMessageId?: unknown; id?: unknown } | null | undefined;
    const evidenceId = normalizeReference(evidence?.gmailMessageId) ?? normalizeReference(evidence?.id);
    return evidenceId ? `zelle:evidence:${evidenceId}` : null;
  }

  if (method === 'binance') {
    const binanceReference = binanceMatchedReference(result, input);
    return binanceReference ? `binance:${binanceReference}` : null;
  }

  if (method === 'pago_movil') {
    const destinationBank = 'bancoDestino' in input ? normalizeReference(input.bancoDestino) : null;
    const phone = 'telefonoCliente' in input ? normalizeReference(input.telefonoCliente) : null;
    if (reference && amount && currency && date && destinationBank && phone) {
      return `pago_movil:${reference}:${date}:${destinationBank}:${phone}:${amount}:${currency}`;
    }
    return null;
  }

  const originBank = 'bancoOrigen' in input ? normalizeReference(input.bancoOrigen) : null;
  const destinationBank = 'bancoDestino' in input ? normalizeReference(input.bancoDestino) : null;
  const clientId = 'cedulaCliente' in input ? normalizeReference(input.cedulaCliente) : null;
  if (reference && amount && currency && date && originBank && destinationBank && clientId) {
    return `transferencia_directa:${reference}:${date}:${originBank}:${destinationBank}:${clientId}:${amount}:${currency}`;
  }

  return null;
}

function idempotencyMatches(
  consumption: {
    externalRequestId: string | null;
    orderNumber: string | null;
    cashierId: string | null;
    cashierName: string | null;
  },
  context: ValidationContextInput | undefined,
  externalRequestId: string | null,
) {
  if (externalRequestId && consumption.externalRequestId === externalRequestId) {
    return true;
  }

  const orderNumber = compactString(context?.orderNumber);
  if (!orderNumber || consumption.orderNumber !== orderNumber) {
    return false;
  }

  const cashierId = compactString(context?.cashierId);
  const cashierName = compactString(context?.cashierName);
  return Boolean(
    (cashierId && consumption.cashierId === cashierId) ||
      (cashierName && consumption.cashierName === cashierName) ||
      (!cashierId && !cashierName),
  );
}

function previousConsumptionPayload(consumption: {
  id: string;
  orderNumber: string | null;
  cashierId: string | null;
  cashierName: string | null;
  channel: PaymentValidationChannel;
  createdAt: Date;
}) {
  return {
    paymentId: consumption.id,
    orderNumber: consumption.orderNumber,
    cashierId: consumption.cashierId,
    cashierName: consumption.cashierName,
    channel: sourceLabel(consumption.channel),
    consumedAt: consumption.createdAt,
  };
}

function baseRecordData(
  companyId: string,
  method: VerificationMethod,
  input: VerificationInput,
  result: AuthorizationResult,
  status: PaymentValidationRecordStatus,
  paymentFingerprint: string | null,
  consumptionId?: string | null,
  duplicateOfConsumptionId?: string | null,
) {
  const context = input.validationContext;
  return {
    companyId,
    method: methodToEnum(method),
    channel: channelFromContext(context),
    status,
    paymentFingerprint,
    externalRequestId: externalRequestIdFromInput(input),
    orderNumber: compactString(context?.orderNumber),
    cashierId: compactString(context?.cashierId),
    cashierName: compactString(context?.cashierName),
    terminalId: compactString(context?.terminalId),
    store: compactString(context?.store),
    validatorPhone: compactString(context?.validatorPhone),
    reference: compactString(input.referenciaEsperada),
    amount: input.montoEsperado,
    currency: input.moneda,
    operationDate: operationDateFromInput(input),
    authorized: result.authorized,
    reasonCode: result.reasonCode,
    requestPayload: toJsonSafe(input),
    responsePayload: toJsonSafe(result),
    evidence:
      toJsonSafe(
        (result.paymentProviderApi as { evidence?: unknown } | undefined)?.evidence ??
          (result.binanceApi as { evidence?: unknown } | undefined)?.evidence ??
          result.evidence ??
          null,
      ),
    consumptionId: consumptionId ?? null,
    duplicateOfConsumptionId: duplicateOfConsumptionId ?? null,
  };
}

async function recordBlockedAttempt(
  result: AuthorizationResult,
  input: VerificationInput,
  paymentFingerprint: string | null,
) {
  const status =
    result.reasonCode === 'duplicate'
      ? PaymentValidationRecordStatus.DUPLICATE
      : PaymentValidationRecordStatus.BLOCKED;

  await prisma.paymentValidationRecord.create({
    data: baseRecordData(result.companyId, result.verificationMethod, input, result, status, paymentFingerprint),
  });

  return {
    ...result,
    consumption: {
      status: result.reasonCode === 'duplicate' ? 'duplicate' : 'not_consumed',
    } satisfies ConsumptionResponse,
  };
}

async function recordDuplicateAttempt(
  result: AuthorizationResult,
  input: VerificationInput,
  paymentFingerprint: string,
  previous: Awaited<ReturnType<typeof prisma.paymentConsumption.findFirst>>,
) {
  if (!previous) {
    return result;
  }

  const duplicateResult: AuthorizationResult = {
    ...result,
    authorized: false,
    reasonCode: 'duplicate',
    riskFlags: Array.from(new Set([...(Array.isArray(result.riskFlags) ? result.riskFlags : []), 'payment_already_consumed'])),
  };

  await prisma.paymentValidationRecord.create({
    data: baseRecordData(
      result.companyId,
      result.verificationMethod,
      input,
      duplicateResult,
      PaymentValidationRecordStatus.DUPLICATE,
      paymentFingerprint,
      null,
      previous.id,
    ),
  });

  return {
    ...duplicateResult,
    consumption: {
      status: 'duplicate',
      previous: previousConsumptionPayload(previous),
    } satisfies ConsumptionResponse,
  };
}

export async function applyAuthorizeConsumption<T extends AuthorizationResult>(
  result: T,
  input: VerificationInput,
): Promise<T & { consumption: ConsumptionResponse }> {
  requireConsumptionContext(input.validationContext);

  const paymentFingerprint = buildPaymentFingerprint(result.verificationMethod, input, result);

  if (!result.authorized) {
    if (result.reasonCode === 'duplicate' && paymentFingerprint) {
      const previous = await prisma.paymentConsumption.findFirst({
        where: {
          companyId: result.companyId,
          method: methodToEnum(result.verificationMethod),
          paymentFingerprint,
          status: PaymentConsumptionStatus.ACTIVE,
        },
      });

      if (previous) {
        return (await recordDuplicateAttempt(result, input, paymentFingerprint, previous)) as T & {
          consumption: ConsumptionResponse;
        };
      }
    }

    return (await recordBlockedAttempt(result, input, paymentFingerprint)) as T & { consumption: ConsumptionResponse };
  }

  if (!paymentFingerprint) {
    throw new ApiError(500, 'payment_fingerprint_missing', 'Authorized payment did not produce a stable fingerprint.');
  }

  const method = methodToEnum(result.verificationMethod);
  const context = input.validationContext;
  const externalRequestId = externalRequestIdFromInput(input);
  const existing = await prisma.paymentConsumption.findFirst({
    where: {
      companyId: result.companyId,
      method,
      paymentFingerprint,
      status: PaymentConsumptionStatus.ACTIVE,
    },
  });

  if (existing) {
    if (idempotencyMatches(existing, context, externalRequestId)) {
      await prisma.paymentValidationRecord.create({
        data: baseRecordData(
          result.companyId,
          result.verificationMethod,
          input,
          result,
          PaymentValidationRecordStatus.AUTHORIZED,
          paymentFingerprint,
          existing.id,
        ),
      });

      return {
        ...result,
        consumption: {
          status: 'idempotent',
          paymentId: existing.id,
          idempotent: true,
          orderNumber: existing.orderNumber,
          cashierId: existing.cashierId,
          cashierName: existing.cashierName,
          channel: sourceLabel(existing.channel),
          consumedAt: existing.createdAt,
        },
      };
    }

    return (await recordDuplicateAttempt(result, input, paymentFingerprint, existing)) as T & {
      consumption: ConsumptionResponse;
    };
  }

  try {
    const { record, consumption } = await prisma.$transaction(async (tx) => {
      const record = await tx.paymentValidationRecord.create({
        data: baseRecordData(
          result.companyId,
          result.verificationMethod,
          input,
          result,
          PaymentValidationRecordStatus.AUTHORIZED,
          paymentFingerprint,
        ),
      });

      const consumption = await tx.paymentConsumption.create({
        data: {
          companyId: result.companyId,
          method,
          paymentFingerprint,
          reference: compactString(input.referenciaEsperada),
          amount: input.montoEsperado,
          currency: input.moneda,
          operationDate: operationDateFromInput(input),
          channel: channelFromContext(context),
          externalRequestId,
          orderNumber: compactString(context?.orderNumber),
          cashierId: compactString(context?.cashierId),
          cashierName: compactString(context?.cashierName),
          terminalId: compactString(context?.terminalId),
          store: compactString(context?.store),
          validatorPhone: compactString(context?.validatorPhone),
          validationRecordId: record.id,
          metadata: toJsonSafe({
            evidence:
              (result.paymentProviderApi as { evidence?: unknown } | undefined)?.evidence ??
              (result.binanceApi as { evidence?: unknown } | undefined)?.evidence ??
              result.evidence ??
              null,
          }),
        },
      });

      await tx.paymentValidationRecord.update({
        where: { id: record.id },
        data: { consumptionId: consumption.id },
      });

      await tx.auditLog.create({
        data: {
          companyId: result.companyId,
          actorType: ActorType.SYSTEM,
          action: 'payment.consumed',
          entityType: 'PaymentConsumption',
          entityId: consumption.id,
          before: null,
          after: toJsonSafe(consumption),
          metadata: {
            method: result.verificationMethod,
            channel: sourceLabel(consumption.channel),
            orderNumber: consumption.orderNumber,
            cashierId: consumption.cashierId,
            cashierName: consumption.cashierName,
          },
        },
      });

      return { record, consumption };
    });

    void record;

    return {
      ...result,
      consumption: {
        status: 'consumed',
        paymentId: consumption.id,
        orderNumber: consumption.orderNumber,
        cashierId: consumption.cashierId,
        cashierName: consumption.cashierName,
        channel: sourceLabel(consumption.channel),
        consumedAt: consumption.createdAt,
      },
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'P2002') {
      throw error;
    }

    const raced = await prisma.paymentConsumption.findFirst({
      where: {
        companyId: result.companyId,
        method,
        paymentFingerprint,
        status: PaymentConsumptionStatus.ACTIVE,
      },
    });

    if (!raced) {
      throw error;
    }

    return (await recordDuplicateAttempt(result, input, paymentFingerprint, raced)) as T & {
      consumption: ConsumptionResponse;
    };
  }
}

export async function recordPaymentValidationOnly<T extends AuthorizationResult>(
  result: T,
  input: VerificationInput,
): Promise<T> {
  const paymentFingerprint = buildPaymentFingerprint(result.verificationMethod, input, result);
  const status =
    result.reasonCode === 'duplicate'
      ? PaymentValidationRecordStatus.DUPLICATE
      : result.authorized
        ? PaymentValidationRecordStatus.AUTHORIZED
        : PaymentValidationRecordStatus.BLOCKED;

  await prisma.paymentValidationRecord.create({
    data: baseRecordData(result.companyId, result.verificationMethod, input, result, status, paymentFingerprint),
  });

  return result;
}

export async function listPaymentConsumptions(
  companySlug: string,
  filters: {
    method?: VerificationMethod;
    status?: 'active' | 'released';
    page?: number;
    pageSize?: number;
  } = {},
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const where = {
    companyId: company.id,
    ...(filters.method ? { method: methodToEnum(filters.method) } : {}),
    ...(filters.status
      ? {
          status:
            filters.status === 'released'
              ? PaymentConsumptionStatus.RELEASED
              : PaymentConsumptionStatus.ACTIVE,
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.paymentConsumption.count({ where }),
    prisma.paymentConsumption.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const duplicateCounts = await Promise.all(
    items.map((item) =>
      prisma.paymentValidationRecord.count({
        where: {
          companyId: company.id,
          duplicateOfConsumptionId: item.id,
        },
      }),
    ),
  );

  return {
    page,
    pageSize,
    total,
    items: items.map((item, index) => serializePaymentConsumption(item, duplicateCounts[index] ?? 0)),
  };
}

export async function releasePaymentConsumption(
  companySlug: string,
  id: string,
  input: { reason: string; releasedBy?: string | null },
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const existing = await prisma.paymentConsumption.findFirst({
    where: {
      id,
      companyId: company.id,
    },
  });

  if (!existing) {
    throw new ApiError(404, 'payment_consumption_not_found', 'Payment consumption was not found.');
  }

  if (existing.status === PaymentConsumptionStatus.RELEASED) {
    return serializePaymentConsumption(existing, 0);
  }

  const released = await prisma.paymentConsumption.update({
    where: { id: existing.id },
    data: {
      status: PaymentConsumptionStatus.RELEASED,
      releasedAt: new Date(),
      releaseReason: input.reason,
      releasedBy: compactString(input.releasedBy),
    },
  });

  await prisma.auditLog.create({
    data: {
      companyId: company.id,
      actorType: ActorType.USER,
      actorId: compactString(input.releasedBy),
      action: 'payment.consumption_released',
      entityType: 'PaymentConsumption',
      entityId: released.id,
      before: toJsonSafe(existing),
      after: toJsonSafe(released),
      metadata: {
        reason: input.reason,
      },
    },
  });

  return serializePaymentConsumption(released, 0);
}

export function serializePaymentConsumption(
  item: {
    id: string;
    companyId: string;
    method: PaymentValidationMethod;
    paymentFingerprint: string;
    status: PaymentConsumptionStatus;
    reference: string | null;
    amount: unknown;
    currency: string | null;
    operationDate: Date | null;
    channel: PaymentValidationChannel;
    externalRequestId: string | null;
    orderNumber: string | null;
    cashierId: string | null;
    cashierName: string | null;
    terminalId: string | null;
    store: string | null;
    validatorPhone: string | null;
    validationRecordId: string | null;
    releasedAt: Date | null;
    releaseReason: string | null;
    releasedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  duplicateCount: number,
) {
  return {
    id: item.id,
    companyId: item.companyId,
    method: enumLabel(item.method),
    paymentFingerprint: item.paymentFingerprint,
    status: enumLabel(item.status),
    reference: item.reference,
    amount: item.amount === null || item.amount === undefined ? null : Number(item.amount),
    currency: item.currency,
    operationDate: item.operationDate,
    channel: sourceLabel(item.channel),
    externalRequestId: item.externalRequestId,
    orderNumber: item.orderNumber,
    cashierId: item.cashierId,
    cashierName: item.cashierName,
    terminalId: item.terminalId,
    store: item.store,
    validatorPhone: item.validatorPhone,
    validationRecordId: item.validationRecordId,
    duplicateCount,
    releasedAt: item.releasedAt,
    releaseReason: item.releaseReason,
    releasedBy: item.releasedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
