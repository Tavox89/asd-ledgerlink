import type { UpsertInstapagoConfigInput } from '@ledgerlink/shared';

import { writeAuditLog } from '../../lib/audit';
import { env } from '../../config/env';
import { ApiError } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { ActorType, InstapagoTransportMode, PaymentProvider } from '../../lib/prisma-runtime';
import { decryptSecretValue, encryptSecretValue } from '../../lib/secret-crypto';
import { serializePaymentProviderConfig } from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';

export const INSTAPAGO_PROVIDER = PaymentProvider.INSTAPAGO;
export const DEFAULT_INSTAPAGO_API_BASE_URL = 'https://merchant.instapago.com/services/api';

function toPrismaTransportMode(
  value: UpsertInstapagoConfigInput['transportMode'],
  existingMode?: typeof InstapagoTransportMode.PROXY | typeof InstapagoTransportMode.DIRECT,
) {
  if (!value && existingMode) {
    return existingMode;
  }

  const mode = value ?? env.INSTAPAGO_DEFAULT_TRANSPORT_MODE;
  return mode === 'direct' ? InstapagoTransportMode.DIRECT : InstapagoTransportMode.PROXY;
}

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

function decryptOptionalCredential(value?: string | null) {
  return value ? decryptCredential(value) : null;
}

function normalizeProxyBaseUrl(value?: string | null) {
  const candidate = value?.trim() || env.INSTAPAGO_DEFAULT_PROXY_BASE_URL.trim();
  return candidate || null;
}

function assertConfigCanBeSaved(input: {
  existing: Awaited<ReturnType<typeof prisma.companyPaymentProviderConfig.findUnique>>;
  transportMode: typeof InstapagoTransportMode.PROXY | typeof InstapagoTransportMode.DIRECT;
  keyId?: string | null;
  publicKeyId?: string | null;
  proxyBaseUrl?: string | null;
  proxyToken?: string | null;
}) {
  if (input.transportMode === InstapagoTransportMode.DIRECT) {
    const hasKeyId = Boolean(input.keyId || input.existing?.keyIdEncrypted);
    const hasPublicKeyId = Boolean(input.publicKeyId || input.existing?.publicKeyIdEncrypted);
    if (!hasKeyId || !hasPublicKeyId) {
      throw new ApiError(
        400,
        'instapago_direct_credentials_required',
        'KeyId and PublicKeyId are required when using direct InstaPago transport.',
      );
    }
    return;
  }

  if (!input.proxyBaseUrl) {
    throw new ApiError(
      400,
      'instapago_proxy_url_required',
      'Proxy base URL is required when using proxy InstaPago transport.',
    );
  }

  if (!input.proxyToken && !input.existing?.proxyTokenEncrypted) {
    throw new ApiError(
      400,
      'instapago_proxy_token_required',
      'Proxy token is required when using proxy InstaPago transport.',
    );
  }
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
  const transportMode = toPrismaTransportMode(input.transportMode, existing?.transportMode);
  const apiBaseUrl = input.apiBaseUrl || existing?.apiBaseUrl || DEFAULT_INSTAPAGO_API_BASE_URL;
  const proxyBaseUrl =
    input.proxyBaseUrl === undefined
      ? existing?.proxyBaseUrl ?? normalizeProxyBaseUrl(null)
      : normalizeProxyBaseUrl(input.proxyBaseUrl);

  assertConfigCanBeSaved({
    existing,
    transportMode,
    keyId: input.keyId,
    publicKeyId: input.publicKeyId,
    proxyBaseUrl,
    proxyToken: input.proxyToken,
  });

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
      transportMode,
      apiBaseUrl,
      keyIdEncrypted: input.keyId ? encryptCredential(input.keyId) : undefined,
      publicKeyIdEncrypted: input.publicKeyId ? encryptCredential(input.publicKeyId) : undefined,
      proxyBaseUrl,
      proxyTokenEncrypted: input.proxyToken ? encryptCredential(input.proxyToken) : undefined,
      defaultReceiptBank: input.defaultReceiptBank,
      defaultOriginBank: input.defaultOriginBank ?? undefined,
    },
    update: {
      isActive: input.isActive,
      transportMode,
      apiBaseUrl,
      keyIdEncrypted: input.keyId ? encryptCredential(input.keyId) : undefined,
      publicKeyIdEncrypted: input.publicKeyId ? encryptCredential(input.publicKeyId) : undefined,
      proxyBaseUrl,
      proxyTokenEncrypted: input.proxyToken ? encryptCredential(input.proxyToken) : undefined,
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
          transportMode: existing.transportMode,
          apiBaseUrl: existing.apiBaseUrl,
          proxyBaseUrl: existing.proxyBaseUrl,
          defaultReceiptBank: existing.defaultReceiptBank,
          defaultOriginBank: existing.defaultOriginBank,
        }
      : null,
    after: {
      provider: record.provider,
      isActive: record.isActive,
      transportMode: record.transportMode,
      apiBaseUrl: record.apiBaseUrl,
      proxyBaseUrl: record.proxyBaseUrl,
      defaultReceiptBank: record.defaultReceiptBank,
      defaultOriginBank: record.defaultOriginBank,
      hasKeyId: Boolean(record.keyIdEncrypted),
      hasPublicKeyId: Boolean(record.publicKeyIdEncrypted),
      hasProxyToken: Boolean(record.proxyTokenEncrypted),
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
    transportMode: config.transportMode,
    apiBaseUrl: config.apiBaseUrl || DEFAULT_INSTAPAGO_API_BASE_URL,
    keyId: decryptOptionalCredential(config.keyIdEncrypted),
    publicKeyId: decryptOptionalCredential(config.publicKeyIdEncrypted),
    proxyBaseUrl: config.proxyBaseUrl,
    proxyToken: decryptOptionalCredential(config.proxyTokenEncrypted),
    defaultReceiptBank: config.defaultReceiptBank,
    defaultOriginBank: config.defaultOriginBank,
  };
}
