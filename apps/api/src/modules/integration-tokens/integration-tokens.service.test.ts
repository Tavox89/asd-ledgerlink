import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeAuditLog = vi.fn();

const prismaMock = {
  companyProfile: {
    findUnique: vi.fn(),
  },
  integrationApiToken: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../../lib/audit', () => ({
  writeAuditLog,
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));

describe('integration token service', () => {
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
      gmailAccount: null,
      whatsAppChannel: null,
    });
  });

  it('creates a hashed integration token and returns the secret only once', async () => {
    const { createIntegrationApiToken } = await import('./integration-tokens.service');

    prismaMock.integrationApiToken.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'token-1',
      companyId: 'company-default',
      company: {
        id: 'company-default',
        slug: 'default',
      },
      name: data.name,
      tokenPrefix: data.tokenPrefix,
      tokenHash: data.tokenHash,
      scopes: data.scopes,
      lastUsedAt: null,
      expiresAt: data.expiresAt ?? null,
      revokedAt: null,
      createdByUserId: data.createdByUserId ?? null,
      createdAt: new Date('2026-04-21T12:00:00.000Z'),
      updatedAt: new Date('2026-04-21T12:00:00.000Z'),
    }));

    const result = await createIntegrationApiToken('default', {
      name: 'OpenPOS bridge',
      scopes: ['verifications:authorize', 'verifications:lookup'],
      expiresAt: null,
      createdByUserId: null,
    });

    expect(result.tokenPrefix).toMatch(/^legtk_[a-f0-9]{12}$/);
    expect(result.token).toMatch(new RegExp(`^${result.tokenPrefix}_[A-Za-z0-9_-]{24,}$`));

    const createCall = prismaMock.integrationApiToken.create.mock.calls[0]?.[0];
    expect(createCall?.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createCall?.data.tokenHash).not.toBe(result.token);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-default',
        action: 'integration_token_created',
        entityType: 'integration_api_token',
      }),
    );
  });

  it('revokes an existing company token', async () => {
    const { revokeIntegrationApiToken } = await import('./integration-tokens.service');

    prismaMock.integrationApiToken.findFirst.mockResolvedValue({
      id: 'token-1',
      companyId: 'company-default',
      company: {
        id: 'company-default',
        slug: 'default',
      },
      name: 'OpenPOS bridge',
      tokenPrefix: 'legtk_a1b2c3d4e5f6',
      tokenHash: 'a'.repeat(64),
      scopes: ['verifications:authorize'],
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdByUserId: null,
      createdAt: new Date('2026-04-21T12:00:00.000Z'),
      updatedAt: new Date('2026-04-21T12:00:00.000Z'),
    });
    prismaMock.integrationApiToken.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'token-1',
      companyId: 'company-default',
      company: {
        id: 'company-default',
        slug: 'default',
      },
      name: 'OpenPOS bridge',
      tokenPrefix: 'legtk_a1b2c3d4e5f6',
      tokenHash: 'a'.repeat(64),
      scopes: ['verifications:authorize'],
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: data.revokedAt,
      createdByUserId: null,
      createdAt: new Date('2026-04-21T12:00:00.000Z'),
      updatedAt: new Date('2026-04-21T12:05:00.000Z'),
    }));

    const result = await revokeIntegrationApiToken('default', 'token-1');

    expect(result.revokedAt).toBeInstanceOf(Date);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-default',
        action: 'integration_token_revoked',
      }),
    );
  });
});
