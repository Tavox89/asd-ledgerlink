import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeAuditLog = vi.fn();
const reprocessStoredEmailsMatchingAllowedSender = vi.fn();

const prismaMock = {
  companyProfile: {
    findUnique: vi.fn(),
  },
  allowedBankSender: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../../lib/audit', () => ({
  writeAuditLog,
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../../lib/serializers', () => ({
  serializeAllowedBankSender: (value: unknown) => value,
}));

vi.mock('../email-processing/ingestion.service', () => ({
  reprocessStoredEmailsMatchingAllowedSender,
}));

describe('settings service sender reprocessing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.companyProfile.findUnique.mockResolvedValue({
      id: 'company-default',
      slug: 'default',
      name: 'Default Workspace',
      gmailAccount: null,
      whatsAppChannel: null,
    });
  });

  it('reprocesses matching ignored emails after creating an active sender', async () => {
    const { createAllowedBankSender } = await import('./settings.service');

    prismaMock.allowedBankSender.create.mockResolvedValue({
      id: 'sender-1',
      companyId: 'company-default',
      bankName: 'Banco Prueba',
      senderEmail: 'pruebas@banco.com',
      senderDomain: null,
      notes: null,
      isActive: true,
      company: {
        id: 'company-default',
        slug: 'default',
      },
    });
    reprocessStoredEmailsMatchingAllowedSender.mockResolvedValue({
      scanned: 2,
      reprocessed: 2,
    });

    await createAllowedBankSender('default', {
      bankName: 'Banco Prueba',
      senderEmail: 'pruebas@banco.com',
      senderDomain: null,
      notes: null,
      isActive: true,
    });

    expect(reprocessStoredEmailsMatchingAllowedSender).toHaveBeenCalledWith({
      id: 'sender-1',
      companyId: 'company-default',
      bankName: 'Banco Prueba',
      senderEmail: 'pruebas@banco.com',
      senderDomain: null,
      notes: null,
      isActive: true,
      company: {
        id: 'company-default',
        slug: 'default',
      },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-default',
        metadata: {
          reprocessScanCount: 2,
          reprocessedIgnoredEmails: 2,
        },
      }),
    );
  });

  it('skips reprocessing when an updated sender is inactive', async () => {
    const { updateAllowedBankSender } = await import('./settings.service');

    prismaMock.allowedBankSender.findFirst.mockResolvedValue({
      id: 'sender-1',
      companyId: 'company-default',
      bankName: 'Banco Prueba',
      senderEmail: 'pruebas@banco.com',
      senderDomain: null,
      notes: null,
      isActive: true,
      company: {
        id: 'company-default',
        slug: 'default',
      },
    });
    prismaMock.allowedBankSender.update.mockResolvedValue({
      id: 'sender-1',
      companyId: 'company-default',
      bankName: 'Banco Prueba',
      senderEmail: 'pruebas@banco.com',
      senderDomain: null,
      notes: null,
      isActive: false,
      company: {
        id: 'company-default',
        slug: 'default',
      },
    });

    await updateAllowedBankSender('default', 'sender-1', {
      isActive: false,
    });

    expect(reprocessStoredEmailsMatchingAllowedSender).not.toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-default',
        metadata: {
          reprocessScanCount: 0,
          reprocessedIgnoredEmails: 0,
        },
      }),
    );
  });
});
