import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeAuditLog = vi.fn();
const encryptSecretValue = vi.fn((value: string) => `encrypted:${value}`);
const decryptSecretValue = vi.fn((value: string) => value.replace(/^encrypted:/, ''));

const prismaMock = {
  companyProfile: {
    findUnique: vi.fn(),
  },
  companyPaymentProviderConfig: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock('../../config/env', () => ({
  env: {
    PAYMENT_CONFIG_ENCRYPTION_KEY: 'test-encryption-key',
    INSTAPAGO_DEFAULT_TRANSPORT_MODE: 'proxy',
    INSTAPAGO_DEFAULT_PROXY_BASE_URL: 'https://clubsamsve.com/wp-json/asd-instapago-proxy/v1',
  },
}));

vi.mock('../../lib/audit', () => ({
  writeAuditLog,
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../../lib/secret-crypto', () => ({
  encryptSecretValue,
  decryptSecretValue,
}));

describe('payment provider config service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.companyProfile.findUnique.mockResolvedValue({
      id: 'company-default',
      slug: 'default',
      name: 'Default Workspace',
      isDefault: true,
      isActive: true,
      notes: null,
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      updatedAt: new Date('2026-04-20T00:00:00.000Z'),
      gmailAccounts: [],
      whatsAppChannel: null,
      paymentProviderConfigs: [],
    });
    prismaMock.companyPaymentProviderConfig.findUnique.mockResolvedValue(null);
  });

  it('creates a proxy InstaPago config without direct credentials', async () => {
    const { upsertInstapagoConfig } = await import('./payment-providers.service');
    prismaMock.companyPaymentProviderConfig.upsert.mockImplementation(async ({ create }) => ({
      id: 'provider-1',
      companyId: create.companyId,
      company: {
        id: create.companyId,
        slug: 'default',
      },
      provider: create.provider,
      isActive: create.isActive,
      transportMode: create.transportMode,
      apiBaseUrl: create.apiBaseUrl,
      keyIdEncrypted: create.keyIdEncrypted ?? null,
      publicKeyIdEncrypted: create.publicKeyIdEncrypted ?? null,
      proxyBaseUrl: create.proxyBaseUrl,
      proxyTokenEncrypted: create.proxyTokenEncrypted ?? null,
      defaultReceiptBank: create.defaultReceiptBank,
      defaultOriginBank: create.defaultOriginBank ?? null,
      metadata: null,
      createdAt: new Date('2026-05-02T12:00:00.000Z'),
      updatedAt: new Date('2026-05-02T12:00:00.000Z'),
    }));

    const result = await upsertInstapagoConfig('default', {
      isActive: true,
      transportMode: 'proxy',
      apiBaseUrl: 'https://merchant.instapago.com/services/api',
      keyId: null,
      publicKeyId: null,
      proxyBaseUrl: 'https://clubsamsve.com/wp-json/asd-instapago-proxy/v1',
      proxyToken: 'proxy-secret-token',
      defaultReceiptBank: '0134',
      defaultOriginBank: null,
    });

    expect(result.transportMode).toBe('proxy');
    expect(result.hasProxyToken).toBe(true);
    expect(result.hasKeyId).toBe(false);
    expect(result.hasPublicKeyId).toBe(false);
    expect(prismaMock.companyPaymentProviderConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          transportMode: 'PROXY',
          keyIdEncrypted: undefined,
          publicKeyIdEncrypted: undefined,
          proxyTokenEncrypted: 'encrypted:proxy-secret-token',
        }),
      }),
    );
  });

  it('rejects direct InstaPago config without credentials', async () => {
    const { upsertInstapagoConfig } = await import('./payment-providers.service');

    await expect(
      upsertInstapagoConfig('default', {
        isActive: true,
        transportMode: 'direct',
        apiBaseUrl: 'https://merchant.instapago.com/services/api',
        keyId: null,
        publicKeyId: null,
        proxyBaseUrl: null,
        proxyToken: null,
        defaultReceiptBank: '0134',
        defaultOriginBank: null,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'instapago_direct_credentials_required',
    });

    expect(prismaMock.companyPaymentProviderConfig.upsert).not.toHaveBeenCalled();
  });

  it('decrypts proxy token only for internal transport calls', async () => {
    const { getDecryptedInstapagoConfig } = await import('./payment-providers.service');
    prismaMock.companyPaymentProviderConfig.findUnique.mockResolvedValue({
      id: 'provider-1',
      companyId: 'company-default',
      provider: 'INSTAPAGO',
      isActive: true,
      transportMode: 'PROXY',
      apiBaseUrl: 'https://merchant.instapago.com/services/api',
      keyIdEncrypted: null,
      publicKeyIdEncrypted: null,
      proxyBaseUrl: 'https://clubsamsve.com/wp-json/asd-instapago-proxy/v1',
      proxyTokenEncrypted: 'encrypted:proxy-secret-token',
      defaultReceiptBank: '0134',
      defaultOriginBank: null,
    });

    const result = await getDecryptedInstapagoConfig('company-default');

    expect(result?.transportMode).toBe('PROXY');
    expect(result?.proxyToken).toBe('proxy-secret-token');
    expect(result?.keyId).toBeNull();
    expect(result?.publicKeyId).toBeNull();
  });
});
