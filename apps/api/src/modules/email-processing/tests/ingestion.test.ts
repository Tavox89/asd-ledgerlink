import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleEmailFixtures } from '../fixtures/sample-emails';

const clearMatchesForInboundEmail = vi.fn();
const syncMatchesForInboundEmail = vi.fn();
const parseBankNotification = vi.fn();

const baseStoredEmail = {
  id: 'email-1',
  companyId: 'company-default',
  gmailAccountId: 'gmail-account-1',
  gmailMessageId: sampleEmailFixtures[2].gmailMessageId,
  gmailThreadId: sampleEmailFixtures[2].gmailThreadId ?? null,
  historyId: sampleEmailFixtures[2].historyId ?? null,
  snippet: sampleEmailFixtures[2].snippet ?? null,
  internalDate: sampleEmailFixtures[2].internalDate ?? null,
  subject: sampleEmailFixtures[2].subject ?? null,
  fromAddress: sampleEmailFixtures[2].fromAddress ?? null,
  toAddress: sampleEmailFixtures[2].toAddress ?? null,
  replyToAddress: sampleEmailFixtures[2].replyToAddress ?? null,
  returnPathAddress: sampleEmailFixtures[2].returnPathAddress ?? null,
  messageIdHeader: sampleEmailFixtures[2].messageIdHeader ?? null,
  bodyText: sampleEmailFixtures[2].bodyText ?? null,
  bodyHtml: sampleEmailFixtures[2].bodyHtml ?? null,
  rawPayload: { headerCount: sampleEmailFixtures[2].headers.length },
  authenticityStatus: 'LOW',
  authScore: 0,
  authenticityFlags: {
    riskFlags: ['reply_to_mismatch', 'suspicious_domain'],
    flags: {
      sender_allowed: false,
    },
  },
  senderMatchType: 'NONE',
  processingStatus: 'RECEIVED',
  receivedAt: new Date('2026-04-17T14:28:00.000Z'),
  parsedAt: null,
  matchedAt: null,
  createdAt: new Date('2026-04-17T14:28:00.000Z'),
  updatedAt: new Date('2026-04-17T14:28:00.000Z'),
};

const prismaMock = {
  allowedBankSender: {
    findMany: vi.fn(),
  },
  parsedBankNotification: {
    deleteMany: vi.fn(),
  },
  inboundEmail: {
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('../../../lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../../matches/matching.service', () => ({
  clearMatchesForInboundEmail,
  syncMatchesForInboundEmail,
}));

vi.mock('../parsers', () => ({
  parseBankNotification,
}));

describe('email ingestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.allowedBankSender.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        inboundEmail: {
          upsert: vi.fn().mockResolvedValue(baseStoredEmail),
          update: vi.fn(),
        },
        emailHeader: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        parsedBankNotification: {
          upsert: vi.fn(),
        },
      }),
    );
    prismaMock.parsedBankNotification.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.inboundEmail.update.mockResolvedValue({
      ...baseStoredEmail,
      processingStatus: 'IGNORED',
      parsedNotification: null,
      matches: [],
    });
  });

  it('stores non-allowlisted emails as ignored and stops the payment pipeline', async () => {
    const { ingestNormalizedEmail } = await import('../ingestion.service');

    const result = await ingestNormalizedEmail('company-default', 'gmail-account-1', sampleEmailFixtures[2]);

    expect(result.processingStatus).toBe('ignored');
    expect(result.senderMatchType).toBe('none');
    expect(clearMatchesForInboundEmail).toHaveBeenCalledWith('company-default', 'email-1');
    expect(prismaMock.parsedBankNotification.deleteMany).toHaveBeenCalledWith({
      where: {
        inboundEmailId: 'email-1',
      },
    });
    expect(syncMatchesForInboundEmail).not.toHaveBeenCalled();
    expect(parseBankNotification).not.toHaveBeenCalled();
  });
});
