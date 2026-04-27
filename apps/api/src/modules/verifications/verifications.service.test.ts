import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateManualVerificationInput } from '@ledgerlink/shared';
import { Prisma } from '@prisma/client';

const loadVerificationCandidateEmails = vi.fn();
const evaluateExactAuthorization = vi.fn();
const pullGmailPubSubMessages = vi.fn();
const getCompanyBySlugOrThrow = vi.fn();

vi.mock('../companies/companies.service', () => ({
  DEFAULT_COMPANY_SLUG: 'default',
  getCompanyBySlugOrThrow,
}));

vi.mock('../pubsub/pubsub.service', () => ({
  pullGmailPubSubMessages,
}));

vi.mock('./exact-authorization', async () => {
  const actual = await vi.importActual<typeof import('./exact-authorization')>('./exact-authorization');

  return {
    ...actual,
    loadVerificationCandidateEmails,
    evaluateExactAuthorization,
  };
});

function buildInput(overrides: Partial<CreateManualVerificationInput> = {}): CreateManualVerificationInput {
  return {
    referenciaEsperada: '000123456711',
    montoEsperado: 168,
    moneda: 'USD',
    fechaOperacion: '2026-04-19T16:43:00.000Z',
    toleranciaMinutos: 180,
    bancoEsperado: null,
    cuentaDestinoUltimos4: null,
    nombreClienteOpcional: null,
    notas: null,
    ...overrides,
  };
}

function buildCandidateEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'email-1',
    gmailMessageId: 'gmail-email-1',
    senderMatchType: 'EMAIL',
    fromAddress: 'donotreply@binance.com',
    subject: 'You received an incoming transfer',
    internalDate: new Date('2026-04-26T22:36:08.000Z'),
    receivedAt: new Date('2026-04-26T22:36:20.000Z'),
    authenticityStatus: 'HIGH',
    authScore: 95,
    authenticityFlags: {
      riskFlags: [],
      flags: {
        sender_allowed: true,
      },
    },
    parsedNotification: {
      id: 'parsed-1',
      inboundEmailId: 'email-1',
      parserName: 'binance-parser',
      bankName: 'Binance',
      reference: '428221485342556160',
      amount: new Prisma.Decimal(5),
      currency: 'USD',
      transferAt: new Date('2026-04-26T22:36:08.000Z'),
      sender: 'donotreply@binance.com',
      subject: 'You received an incoming transfer',
      destinationAccountLast4: null,
      originatorName: 'Edelynr',
      confidenceScore: 90,
      extractedData: {
        assetSymbol: 'USDT',
      },
      createdAt: new Date('2026-04-26T22:36:20.000Z'),
      updatedAt: new Date('2026-04-26T22:36:20.000Z'),
    },
    ...overrides,
  };
}

describe('verification service auto-refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCompanyBySlugOrThrow.mockResolvedValue({
      id: 'company-default',
      slug: 'default',
      name: 'Default Workspace',
    });
  });

  it('retries with a Pub/Sub pull when the first lookup has no exact candidates', async () => {
    const { lookupVerification } = await import('./verifications.service');

    loadVerificationCandidateEmails
      .mockResolvedValueOnce({
        window: {
          operationAt: new Date('2026-04-19T16:43:00.000Z'),
          expectedWindowFrom: new Date('2026-04-19T13:43:00.000Z'),
          expectedWindowTo: new Date('2026-04-19T19:43:00.000Z'),
        },
        candidateEmails: [],
      })
      .mockResolvedValueOnce({
        window: {
          operationAt: new Date('2026-04-19T16:43:00.000Z'),
          expectedWindowFrom: new Date('2026-04-19T13:43:00.000Z'),
          expectedWindowTo: new Date('2026-04-19T19:43:00.000Z'),
        },
        candidateEmails: [],
      });

    evaluateExactAuthorization
      .mockReturnValueOnce({
        authorized: false,
        reasonCode: 'sender',
        candidateCount: 0,
        senderMatchType: 'none',
        evidence: null,
        strongestEmail: null,
        strongestAuthStatus: null,
        strongestAuthScore: null,
        officialSenderMatched: 'unknown',
        riskFlags: [],
        candidateEmails: [],
      })
      .mockReturnValueOnce({
        authorized: true,
        reasonCode: 'authorized',
        candidateCount: 1,
        senderMatchType: 'email',
        evidence: {
          id: 'email-1',
          gmailMessageId: 'gmail-email-1',
          senderMatchType: 'email',
          senderAddress: 'tester@bank.com',
          subject: 'Payment received',
          arrivalTimestamp: '2026-04-19T16:44:00.000Z',
          parsedPaymentTimestamp: '2026-04-17T10:32:00.000Z',
          receivedAt: '2026-04-19T16:44:05.000Z',
          reference: '000123456711',
          amount: 168,
          currency: 'USD',
          authenticityStatus: 'high',
          authScore: 90,
          riskFlags: [],
        },
        strongestEmail: null,
        strongestAuthStatus: 'high',
        strongestAuthScore: 90,
        officialSenderMatched: true,
        riskFlags: [],
        candidateEmails: [],
      });

    pullGmailPubSubMessages.mockResolvedValue({
      pulled: 1,
      processed: 1,
      messages: [],
    });

    const result = await lookupVerification('default', buildInput());

    expect(pullGmailPubSubMessages).toHaveBeenCalledWith('default', 10);
    expect(loadVerificationCandidateEmails).toHaveBeenCalledTimes(2);
    expect(result.authorized).toBe(true);
    expect(result.reasonCode).toBe('authorized');
    expect(result.evidence?.gmailMessageId).toBe('gmail-email-1');
    expect(result.autoRefresh).toEqual({
      attempted: true,
      status: 'retried',
      pulled: 1,
      processed: 1,
    });
  });

  it('does not pull Pub/Sub again when the first exact evaluation already authorizes', async () => {
    const { authorizeVerification } = await import('./verifications.service');

    loadVerificationCandidateEmails.mockResolvedValue({
      window: {
        operationAt: new Date('2026-04-19T16:43:00.000Z'),
        expectedWindowFrom: new Date('2026-04-19T13:43:00.000Z'),
        expectedWindowTo: new Date('2026-04-19T19:43:00.000Z'),
      },
      candidateEmails: [],
    });

    evaluateExactAuthorization.mockReturnValue({
      authorized: true,
      reasonCode: 'authorized',
      candidateCount: 1,
      senderMatchType: 'email',
      evidence: {
        id: 'email-1',
        gmailMessageId: 'gmail-email-1',
        senderMatchType: 'email',
        senderAddress: 'tester@bank.com',
        subject: 'Payment received',
        arrivalTimestamp: '2026-04-19T16:44:00.000Z',
        parsedPaymentTimestamp: '2026-04-17T10:32:00.000Z',
        receivedAt: '2026-04-19T16:44:05.000Z',
        reference: '000123456711',
        amount: 168,
        currency: 'USD',
        authenticityStatus: 'high',
        authScore: 90,
        riskFlags: [],
      },
      strongestEmail: null,
      strongestAuthStatus: 'high',
      strongestAuthScore: 90,
      officialSenderMatched: true,
      riskFlags: [],
      candidateEmails: [],
    });

    const result = await authorizeVerification('default', buildInput());

    expect(pullGmailPubSubMessages).not.toHaveBeenCalled();
    expect(result.authorized).toBe(true);
    expect(result.autoRefresh).toEqual({
      attempted: false,
      status: 'not_needed',
      pulled: 0,
      processed: 0,
    });
  });

  it('does not hit Gmail or Pub/Sub when neither reference nor name is provided', async () => {
    const { authorizeVerification } = await import('./verifications.service');

    evaluateExactAuthorization.mockReturnValue({
      authorized: false,
      reasonCode: 'identity_required',
      candidateCount: 0,
      senderMatchType: 'none',
      evidence: null,
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: 'unknown',
      riskFlags: [],
      candidateEmails: [],
    });

    const result = await authorizeVerification(
      'default',
      buildInput({
        referenciaEsperada: null,
        nombreClienteOpcional: null,
      }),
    );

    expect(loadVerificationCandidateEmails).not.toHaveBeenCalled();
    expect(pullGmailPubSubMessages).not.toHaveBeenCalled();
    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('identity_required');
    expect(result.autoRefresh).toEqual({
      attempted: false,
      status: 'not_needed',
      pulled: 0,
      processed: 0,
    });
  });

  it('filters candidate evidence to Binance-only emails for Binance authorization', async () => {
    const { authorizeBinanceVerification } = await import('./verifications.service');

    const binanceCandidate = buildCandidateEmail();
    const zelleCandidate = buildCandidateEmail({
      id: 'email-zelle-1',
      gmailMessageId: 'gmail-zelle-1',
      subject: 'Notification - GUILLERMO DIAZ ORTIZ sent you $10.00.',
      fromAddress: 'donotreply@amerantbank.com',
      parsedNotification: {
        id: 'parsed-zelle-1',
        inboundEmailId: 'email-zelle-1',
        parserName: 'generic-bank-parser',
        bankName: 'Banco de Venezuela',
        reference: '760045800',
        amount: new Prisma.Decimal(10),
        currency: 'USD',
        transferAt: new Date('2026-04-26T22:36:08.000Z'),
        sender: 'donotreply@amerantbank.com',
        subject: 'Notification - GUILLERMO DIAZ ORTIZ sent you $10.00.',
        destinationAccountLast4: null,
        originatorName: 'GUILLERMO DIAZ ORTIZ',
        confidenceScore: 88,
        extractedData: {},
        createdAt: new Date('2026-04-26T22:36:20.000Z'),
        updatedAt: new Date('2026-04-26T22:36:20.000Z'),
      },
    });

    loadVerificationCandidateEmails.mockResolvedValue({
      window: {
        operationAt: new Date('2026-04-26T22:36:08.000Z'),
        expectedWindowFrom: new Date('2026-04-26T19:36:08.000Z'),
        expectedWindowTo: new Date('2026-04-27T01:36:08.000Z'),
      },
      candidateEmails: [binanceCandidate, zelleCandidate],
    });

    evaluateExactAuthorization.mockReturnValue({
      authorized: true,
      reasonCode: 'authorized',
      candidateCount: 1,
      senderMatchType: 'email',
      evidence: {
        id: 'email-1',
        gmailMessageId: 'gmail-email-1',
        senderMatchType: 'email',
      },
      strongestEmail: null,
      strongestAuthStatus: 'high',
      strongestAuthScore: 95,
      officialSenderMatched: true,
      riskFlags: [],
      candidateEmails: [binanceCandidate],
    });

    const result = await authorizeBinanceVerification(
      'default',
      buildInput({
        referenciaEsperada: '428221485342556160',
        montoEsperado: 5,
        moneda: 'USD',
        bancoEsperado: null,
        nombreClienteOpcional: 'Edelynr',
        fechaOperacion: '2026-04-26T22:36:08.000Z',
      }),
    );

    expect(evaluateExactAuthorization).toHaveBeenCalledWith(expect.anything(), [binanceCandidate]);
    expect(pullGmailPubSubMessages).not.toHaveBeenCalled();
    expect(result.verificationMethod).toBe('binance');
    expect(result.authorized).toBe(true);
  });
});
