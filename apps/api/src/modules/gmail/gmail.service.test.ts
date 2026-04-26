import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  gmailAccount: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

const writeAuditLog = vi.fn();
const getCompanyBySlugOrThrow = vi.fn();

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../../lib/audit', () => ({
  writeAuditLog,
}));

vi.mock('../companies/companies.service', () => ({
  getCompanyBySlugOrThrow,
}));

function buildAccount(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-04-26T12:00:00.000Z');

  return {
    id: 'gmail-account-1',
    companyId: 'company-default',
    email: 'operations@example.com',
    googleAccountId: null,
    displayName: null,
    isActive: true,
    profileSnapshot: {
      profile: {
        emailAddress: 'operations@example.com',
        messagesTotal: 10,
        threadsTotal: 8,
        historyId: '100',
      },
    },
    connectedAt: now,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
    token: {
      id: 'token-1',
      gmailAccountId: 'gmail-account-1',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      scope: 'scope',
      tokenType: 'Bearer',
      expiryDate: now,
      createdAt: now,
      updatedAt: now,
    },
    watches: [
      {
        id: 'watch-1',
        gmailAccountId: 'gmail-account-1',
        topicName: 'topic',
        subscriptionName: 'subscription',
        historyId: '100',
        expirationAt: now,
        status: 'ACTIVE',
        lastPulledAt: now,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...overrides,
  };
}

describe('gmail service mailbox controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCompanyBySlugOrThrow.mockResolvedValue({
      id: 'company-default',
      slug: 'default',
      name: 'Default',
    });
  });

  it('summarizes active and inactive inboxes separately', async () => {
    const { getGmailProfile } = await import('./gmail.service');

    prismaMock.gmailAccount.findMany.mockResolvedValue([
      buildAccount({
        id: 'gmail-account-1',
        email: 'active@example.com',
        isActive: true,
        token: { id: 'token-1' },
      }),
      buildAccount({
        id: 'gmail-account-2',
        email: 'inactive@example.com',
        isActive: false,
        token: { id: 'token-2' },
        watches: [],
      }),
    ]);

    const result = await getGmailProfile('default');

    expect(result.summary.connectedInboxCount).toBe(1);
    expect(result.summary.watchHealthSummary).toMatchObject({
      total: 2,
      active: 1,
      inactive: 1,
      pending: 0,
      error: 0,
      expired: 0,
    });
    expect(result.accounts.map((account) => ({ email: account.email, isActive: account.isActive }))).toEqual([
      { email: 'active@example.com', isActive: true },
      { email: 'inactive@example.com', isActive: false },
    ]);
  });

  it('updates mailbox active state and records an audit event', async () => {
    const { setCompanyGmailAccountActive } = await import('./gmail.service');

    prismaMock.gmailAccount.findFirst.mockResolvedValue(
      buildAccount({
        id: 'gmail-account-2',
        email: 'inactive@example.com',
        isActive: true,
      }),
    );
    prismaMock.gmailAccount.update.mockResolvedValue(
      buildAccount({
        id: 'gmail-account-2',
        email: 'inactive@example.com',
        isActive: false,
      }),
    );

    const result = await setCompanyGmailAccountActive('default', 'gmail-account-2', false);

    expect(prismaMock.gmailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'gmail-account-2' },
        data: { isActive: false },
      }),
    );
    expect(result.isActive).toBe(false);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'gmail.deactivated',
        entityType: 'GmailAccount',
        entityId: 'gmail-account-2',
      }),
    );
  });

  it('blocks per-account sync when the mailbox is inactive', async () => {
    const { syncRecentInboxMessagesForCompanyAccount } = await import('./gmail.service');

    prismaMock.gmailAccount.findFirst.mockResolvedValue(
      buildAccount({
        id: 'gmail-account-2',
        email: 'inactive@example.com',
        isActive: false,
      }),
    );

    await expect(
      syncRecentInboxMessagesForCompanyAccount('default', 'gmail-account-2', 10),
    ).rejects.toMatchObject({
      code: 'gmail_account_inactive',
    });
  });
});
