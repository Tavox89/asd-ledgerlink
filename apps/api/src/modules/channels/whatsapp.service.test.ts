import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeAuditLog = vi.fn();
const authorizeVerification = vi.fn();
const extractVerificationFromImage = vi.fn();
const sendTwilioWhatsAppReply = vi.fn();

const prismaMock = {
  whatsAppChannel: {
    findFirst: vi.fn(),
  },
  whatsAppConversation: {
    upsert: vi.fn(),
    update: vi.fn(),
  },
  whatsAppInboundMessage: {
    create: vi.fn(),
  },
  whatsAppVerificationAttempt: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

function buildChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'channel-1',
    companyId: 'company-default',
    phoneNumber: '+10000000000',
    messagingServiceSid: null,
    allowedTestNumbers: ['+584121112233'],
    isActive: true,
    company: {
      id: 'company-default',
      slug: 'default',
      name: 'Default Workspace',
    },
    ...overrides,
  };
}

vi.mock('../../lib/audit', () => ({
  writeAuditLog,
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../../lib/serializers', () => ({
  serializeWhatsAppVerificationAttempt: (value: unknown) => value,
}));

vi.mock('../verifications/verifications.service', () => ({
  authorizeVerification,
}));

vi.mock('./whatsapp.vision', () => ({
  extractVerificationFromImage,
}));

vi.mock('./whatsapp.twilio', () => ({
  sendTwilioWhatsAppReply,
}));

function buildConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conversation-1',
    phoneNumber: '+584121112233',
    status: 'IDLE',
    partialPayload: null,
    pendingFields: [],
    lastInboundMessageId: null,
    lastInboundAt: null,
    lastAttemptAt: null,
    createdAt: new Date('2026-04-21T15:00:00.000Z'),
    updatedAt: new Date('2026-04-21T15:00:00.000Z'),
    ...overrides,
  };
}

function buildInboundMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inbound-1',
    conversationId: 'conversation-1',
    twilioMessageSid: 'SM123',
    fromPhoneNumber: '+584121112233',
    toPhoneNumber: '+10000000000',
    direction: 'inbound',
    bodyText: '',
    numMedia: 0,
    media: [],
    rawPayload: {},
    receivedAt: new Date('2026-04-21T15:05:00.000Z'),
    createdAt: new Date('2026-04-21T15:05:00.000Z'),
    updatedAt: new Date('2026-04-21T15:05:00.000Z'),
    ...overrides,
  };
}

function buildAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'attempt-1',
    ...overrides,
  };
}

describe('whatsapp service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.whatsAppChannel.findFirst.mockResolvedValue(buildChannel());
    prismaMock.whatsAppConversation.upsert.mockResolvedValue(buildConversation());
    prismaMock.whatsAppConversation.update.mockResolvedValue(buildConversation());
    prismaMock.whatsAppInboundMessage.create.mockResolvedValue(buildInboundMessage());
    prismaMock.whatsAppVerificationAttempt.create.mockResolvedValue(buildAttempt());
    prismaMock.whatsAppVerificationAttempt.findMany.mockResolvedValue([]);
    prismaMock.whatsAppVerificationAttempt.count.mockResolvedValue(0);
    prismaMock.whatsAppVerificationAttempt.findFirst.mockResolvedValue(null);
    prismaMock.whatsAppVerificationAttempt.update.mockResolvedValue(buildAttempt());
    extractVerificationFromImage.mockResolvedValue(null);
    sendTwilioWhatsAppReply.mockResolvedValue({
      sid: 'SM-OUTBOUND',
      from: 'whatsapp:+10000000000',
      to: 'whatsapp:+584121112233',
      status: 'sent',
    });
  });

  it('rejects numbers that are not in the pilot allowlist without authorizing', async () => {
    const { processIncomingTwilioWebhook } = await import('./whatsapp.service');

    const result = await processIncomingTwilioWebhook({
      From: 'whatsapp:+584141234567',
      To: 'whatsapp:+10000000000',
      Body: 'ref 123 monto 99',
      MessageSid: 'SM-UNAUTHORIZED',
      NumMedia: '0',
    });

    expect(result.status).toBe('unauthorized');
    expect(authorizeVerification).not.toHaveBeenCalled();
    expect(prismaMock.whatsAppVerificationAttempt.create).toHaveBeenCalled();
  });

  it('keeps a conversation open and asks only for missing fields', async () => {
    const { processIncomingTwilioWebhook } = await import('./whatsapp.service');

    const result = await processIncomingTwilioWebhook({
      From: 'whatsapp:+584121112233',
      To: 'whatsapp:+10000000000',
      Body: 'referencia 000123456124',
      MessageSid: 'SM-MISSING',
      NumMedia: '0',
    });

    expect(result.status).toBe('incomplete');
    expect(result.replyText).toContain('monto');
    expect(result.replyText).not.toContain('nombre');
    expect(authorizeVerification).not.toHaveBeenCalled();
    expect(prismaMock.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'AWAITING_DETAILS',
        }),
      }),
    );
  });

  it('uses typed text over image extraction and authorizes on the extracted datetime fallback', async () => {
    const { processIncomingTwilioWebhook } = await import('./whatsapp.service');

    prismaMock.whatsAppInboundMessage.create.mockResolvedValue(
      buildInboundMessage({
        bodyText: 'nombre Guillermo Diaz ref 000123456124 monto 123 fecha 17/04/2026 14:38',
        numMedia: 1,
        media: [{ index: 0, contentType: 'image/jpeg', url: 'https://example.com/image.jpg' }],
      }),
    );
    extractVerificationFromImage.mockResolvedValue({
      isTransferProof: true,
      reference: 'IMG-REFERENCE',
      customerName: 'Imagen Nombre',
      amount: 999,
      currency: 'VES',
      date: '2026-04-17',
      time: null,
      bank: 'Banco Imagen',
      confidence: 90,
    });
    authorizeVerification
      .mockResolvedValueOnce({
        authorized: false,
        reasonCode: 'date',
        candidateCount: 0,
        senderMatchType: 'email',
        evidence: null,
        strongestEmail: null,
        strongestAuthStatus: null,
        strongestAuthScore: null,
        officialSenderMatched: true,
        riskFlags: [],
        autoRefresh: { attempted: false, status: 'not_needed', pulled: 0, processed: 0 },
      })
      .mockResolvedValueOnce({
        authorized: true,
        reasonCode: 'authorized',
        candidateCount: 1,
        senderMatchType: 'email',
        evidence: { gmailMessageId: 'gmail-1' },
        strongestEmail: null,
        strongestAuthStatus: 'high',
        strongestAuthScore: 95,
        officialSenderMatched: true,
        riskFlags: [],
        autoRefresh: { attempted: false, status: 'not_needed', pulled: 0, processed: 0 },
      });

    const result = await processIncomingTwilioWebhook({
      From: 'whatsapp:+584121112233',
      To: 'whatsapp:+10000000000',
      Body: 'nombre Guillermo Diaz ref 000123456124 monto 123 fecha 17/04/2026 14:38',
      MessageSid: 'SM-MIXED',
      NumMedia: '1',
      MediaUrl0: 'https://example.com/image.jpg',
      MediaContentType0: 'image/jpeg',
    });

    expect(result.status).toBe('authorized');
    expect(authorizeVerification).toHaveBeenCalledTimes(2);
    expect(authorizeVerification.mock.calls[0]?.[0]).toBe('default');
    expect(authorizeVerification.mock.calls[0]?.[1]).toMatchObject({
      referenciaEsperada: '000123456124',
      nombreClienteOpcional: 'Guillermo Diaz',
      montoEsperado: 123,
      moneda: 'VES',
    });
    expect(authorizeVerification.mock.calls[1]?.[0]).toBe('default');
    expect(authorizeVerification.mock.calls[1]?.[1]).toMatchObject({
      referenciaEsperada: '000123456124',
      nombreClienteOpcional: 'Guillermo Diaz',
      montoEsperado: 123,
      fechaOperacion: expect.stringContaining('2026-04-17T'),
    });
    expect(result.replyText).toContain('Si, pago valido');
  });

  it('uses a whole-day strategy when only the extracted date is available', async () => {
    const { processIncomingTwilioWebhook } = await import('./whatsapp.service');

    authorizeVerification
      .mockResolvedValueOnce({
        authorized: false,
        reasonCode: 'date',
        candidateCount: 0,
        senderMatchType: 'email',
        evidence: null,
        strongestEmail: null,
        strongestAuthStatus: null,
        strongestAuthScore: null,
        officialSenderMatched: true,
        riskFlags: [],
        autoRefresh: { attempted: false, status: 'not_needed', pulled: 0, processed: 0 },
      })
      .mockResolvedValueOnce({
        authorized: true,
        reasonCode: 'authorized',
        candidateCount: 1,
        senderMatchType: 'email',
        evidence: { gmailMessageId: 'gmail-2' },
        strongestEmail: null,
        strongestAuthStatus: 'high',
        strongestAuthScore: 95,
        officialSenderMatched: true,
        riskFlags: [],
        autoRefresh: { attempted: false, status: 'not_needed', pulled: 0, processed: 0 },
      });

    const result = await processIncomingTwilioWebhook({
      From: 'whatsapp:+584121112233',
      To: 'whatsapp:+10000000000',
      Body: 'nombre Guillermo Diaz referencia 000123456124 monto 123 fecha 17 de abril de 2026',
      MessageSid: 'SM-DATE-ONLY',
      NumMedia: '0',
    });

    expect(result.status).toBe('authorized');
    expect(authorizeVerification.mock.calls[1]?.[0]).toBe('default');
    expect(authorizeVerification.mock.calls[1]?.[1]).toMatchObject({
      nombreClienteOpcional: 'Guillermo Diaz',
      toleranciaMinutos: 720,
    });
  });

  it('returns a controlled fallback when an image is not recognized as payment proof', async () => {
    const { processIncomingTwilioWebhook } = await import('./whatsapp.service');

    extractVerificationFromImage.mockResolvedValue({
      isTransferProof: false,
      reference: null,
      customerName: null,
      amount: null,
      currency: null,
      date: null,
      time: null,
      bank: null,
      confidence: 10,
      rawText: '{"isTransferProof":false}',
      failureReason: 'not_transfer_proof',
    });

    const result = await processIncomingTwilioWebhook({
      From: 'whatsapp:+584121112233',
      To: 'whatsapp:+10000000000',
      Body: '',
      MessageSid: 'SM-NOT-PAYMENT',
      NumMedia: '1',
      MediaUrl0: 'https://example.com/image.jpg',
      MediaContentType0: 'image/jpeg',
    });

    expect(result.status).toBe('incomplete');
    expect(result.replyText).toContain('no pude identificar un comprobante');
    expect(authorizeVerification).not.toHaveBeenCalled();
    expect(prismaMock.whatsAppVerificationAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceSummary: expect.objectContaining({
            imageExtraction: expect.objectContaining({
              failureReason: 'not_transfer_proof',
              rawText: '{"isTransferProof":false}',
            }),
          }),
        }),
      }),
    );
  });

  it('sends the reply through Twilio API and returns empty TwiML', async () => {
    const { buildWebhookReplyXml } = await import('./whatsapp.service');

    authorizeVerification.mockResolvedValueOnce({
      authorized: true,
      reasonCode: 'authorized',
      candidateCount: 1,
      senderMatchType: 'email',
      evidence: { gmailMessageId: 'gmail-3' },
      strongestEmail: null,
      strongestAuthStatus: 'high',
      strongestAuthScore: 95,
      officialSenderMatched: true,
      riskFlags: [],
      autoRefresh: { attempted: false, status: 'not_needed', pulled: 0, processed: 0 },
    });

    const xml = await buildWebhookReplyXml({
      From: 'whatsapp:+584121112233',
      To: 'whatsapp:+10000000000',
      Body: 'nombre Guillermo Diaz ref 000123456124 monto 123',
      MessageSid: 'SM-OUTBOUND-TEST',
      NumMedia: '0',
    });

    expect(sendTwilioWhatsAppReply).toHaveBeenCalledWith(
      expect.objectContaining({
        toPhoneNumber: '+584121112233',
      }),
    );
    expect(xml).toContain('<Response></Response>');
    expect(prismaMock.whatsAppVerificationAttempt.update).toHaveBeenCalled();
  });

  it('reuses an existing attempt without sending a duplicate outbound message', async () => {
    const { buildWebhookReplyXml } = await import('./whatsapp.service');

    prismaMock.whatsAppVerificationAttempt.findFirst.mockResolvedValue({
      id: 'attempt-existing',
      companyId: 'company-default',
      conversationId: 'conversation-1',
      phoneNumber: '+584121112233',
      finalResult: {
        replyText: 'Si, pago valido.',
        delivery: {
          twilioMessageSid: 'SM-ALREADY-SENT',
        },
      },
      company: {
        id: 'company-default',
        slug: 'default',
        name: 'Default Workspace',
        whatsAppChannel: {
          phoneNumber: '+10000000000',
          messagingServiceSid: null,
        },
      },
      conversation: buildConversation(),
      inboundMessage: buildInboundMessage({
        twilioMessageSid: 'SM-EXISTING',
      }),
    });

    const xml = await buildWebhookReplyXml({
      From: 'whatsapp:+584121112233',
      To: 'whatsapp:+10000000000',
      Body: 'nombre Guillermo Diaz ref 000123456124 monto 123',
      MessageSid: 'SM-EXISTING',
      NumMedia: '0',
    });

    expect(sendTwilioWhatsAppReply).not.toHaveBeenCalled();
    expect(authorizeVerification).not.toHaveBeenCalled();
    expect(xml).toContain('<Response></Response>');
  });
});
