import type { UpsertInstapagoConfigInput } from '@ledgerlink/shared';

import { writeAuditLog } from '../../lib/audit';
import { env } from '../../config/env';
import { ApiError } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { PaymentProvider, ActorType } from '../../lib/prisma-runtime';
import { decryptSecretValue, encryptSecretValue } from '../../lib/secret-crypto';
import { serializePaymentProviderConfig } from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';

export const INSTAPAGO_PROVIDER = PaymentProvider.INSTAPAGO;
export const DEFAULT_INSTAPAGO_API_BASE_URL = 'https://merchant.instapago.com/services/api';

function assertEncryptionConfigured() {
  if (!env.PAYMENT_CONFIG_ENCRYPTION_KEY.trim()) {
    throw new ApiError(
      500,
      'payment_config_encryption_key_missing',
      'Payment provider credential encryption key is not configured.',
    );
  }
}

function encryptCredential(value: string) {
  assertEncryptionConfigured();
  return encryptSecretValue(value, env.PAYMENT_CONFIG_ENCRYPTION_KEY);
}

function decryptCredential(value: string) {
  assertEncryptionConfigured();
  return decryptSecretValue(value, env.PAYMENT_CONFIG_ENCRYPTION_KEY);
}

export async function getInstapagoConfig(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const config = await prisma.companyPaymentProviderConfig.findUnique({
    where: {
      companyId_provider: {
        companyId: company.id,
        provider: INSTAPAGO_PROVIDER,
      },
    },
    include: {
      company: true,
    },
  });

  return config ? serializePaymentProviderConfig(config) : null;
}

export async function upsertInstapagoConfig(companySlug: string, input: UpsertInstapagoConfigInput) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const existing = await prisma.companyPaymentProviderConfig.findUnique({
    where: {
      companyId_provider: {
        companyId: company.id,
        provider: INSTAPAGO_PROVIDER,
      },
    },
  });

  if (!existing && (!input.keyId || !input.publicKeyId)) {
    throw new ApiError(
      400,
      'instapago_credentials_required',
      'KeyId and PublicKeyId are required when creating the InstaPago configuration.',
    );
  }

  const record = await prisma.companyPaymentProviderConfig.upsert({
    where: {
      companyId_provider: {
        companyId: company.id,
        provider: INSTAPAGO_PROVIDER,
      },
    },
    create: {
      companyId: company.id,
      provider: INSTAPAGO_PROVIDER,
      isActive: input.isActive,
      apiBaseUrl: input.apiBaseUrl || DEFAULT_INSTAPAGO_API_BASE_URL,
      keyIdEncrypted: encryptCredential(input.keyId ?? ''),
      publicKeyIdEncrypted: encryptCredential(input.publicKeyId ?? ''),
      defaultReceiptBank: input.defaultReceiptBank,
      defaultOriginBank: input.defaultOriginBank ?? undefined,
    },
    update: {
      isActive: input.isActive,
      apiBaseUrl: input.apiBaseUrl || DEFAULT_INSTAPAGO_API_BASE_URL,
      keyIdEncrypted: input.keyId ? encryptCredential(input.keyId) : undefined,
      publicKeyIdEncrypted: input.publicKeyId ? encryptCredential(input.publicKeyId) : undefined,
      defaultReceiptBank: input.defaultReceiptBank,
      defaultOriginBank: input.defaultOriginBank ?? null,
    },
    include: {
      company: true,
    },
  });

  await writeAuditLog({
    companyId: company.id,
    actorType: ActorType.USER,
    action: existing ? 'payment_provider_config_updated' : 'payment_provider_config_created',
    entityType: 'payment_provider_config',
    entityId: record.id,
    before: existing
      ? {
          provider: existing.provider,
          isActive: existing.isActive,
          apiBaseUrl: existing.apiBaseUrl,
          defaultReceiptBank: existing.defaultReceiptBank,
          defaultOriginBank: existing.defaultOriginBank,
        }
      : null,
    after: {
      provider: record.provider,
      isActive: record.isActive,
      apiBaseUrl: record.apiBaseUrl,
      defaultReceiptBank: record.defaultReceiptBank,
      defaultOriginBank: record.defaultOriginBank,
      hasKeyId: Boolean(record.keyIdEncrypted),
      hasPublicKeyId: Boolean(record.publicKeyIdEncrypted),
    },
  });

  return serializePaymentProviderConfig(record);
}

export async function getDecryptedInstapagoConfig(companyId: string) {
  const config = await prisma.companyPaymentProviderConfig.findUnique({
    where: {
      companyId_provider: {
        companyId,
        provider: INSTAPAGO_PROVIDER,
      },
    },
  });

  if (!config || !config.isActive) {
    return null;
  }

  return {
    id: config.id,
    companyId: config.companyId,
    provider: config.provider,
    isActive: config.isActive,
    apiBaseUrl: config.apiBaseUrl || DEFAULT_INSTAPAGO_API_BASE_URL,
    keyId: decryptCredential(config.keyIdEncrypted),
    publicKeyId: decryptCredential(config.publicKeyIdEncrypted),
    defaultReceiptBank: config.defaultReceiptBank,
    defaultOriginBank: config.defaultOriginBank,
  };
}
