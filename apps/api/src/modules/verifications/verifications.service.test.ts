import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateManualVerificationInput } from '@ledgerlink/shared';

const loadVerificationCandidateEmails = vi.fn();
const evaluateExactAuthorization = vi.fn();
const evaluateBinancePayAuthorization = vi.fn();
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
  const actual = await vi.importActual<Record<string, unknown>>('./exact-authorization');

  return {
    ...actual,
    loadVerificationCandidateEmails,
    evaluateExactAuthorization,
  };
});

vi.mock('./binance-pay-authorization', () => ({
  evaluateBinancePayAuthorization,
}));

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
      senderMatchType: 'none',
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

  it('authorizes Binance through the official Binance Pay API evaluator', async () => {
    const { authorizeBinanceVerification } = await import('./verifications.service');

    evaluateBinancePayAuthorization.mockResolvedValue({
      authorized: true,
      reasonCode: 'authorized',
      candidateCount: 1,
      senderMatchType: 'email',
      evidence: null,
      binanceApi: {
        checked: true,
        configured: true,
        windowStart: '2026-04-26T04:00:00.000Z',
        windowEnd: '2026-04-27T03:59:59.999Z',
        transactionCount: 1,
        matchedTransactionId: '428221485342556160',
        matchMode: 'both',
        dateStrategy: 'exact_window',
        evidence: {
          source: 'binance_api',
          transactionId: '428221485342556160',
          orderType: 'C2C',
          transactionTime: '2026-04-26T22:36:08.000Z',
          amount: 5,
          currency: 'USD',
          assetSymbol: 'USDT',
          payerName: 'Edelynr',
          payerBinanceId: 'payer-1',
          receiverName: 'Gedcorp',
          receiverBinanceId: 'receiver-1',
          receiverAccountId: null,
          receiverEmail: null,
          receiverMatched: true,
          matchMode: 'both',
          dateStrategy: 'exact_window',
          referenceMatched: true,
          nameMatched: true,
          amountMatched: true,
        },
      },
      strongestEmail: null,
      strongestAuthStatus: 'high',
      strongestAuthScore: 100,
      officialSenderMatched: true,
      riskFlags: [],
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

    expect(evaluateBinancePayAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-default',
        referenceExpected: '428221485342556160',
        customerNameExpected: 'Edelynr',
        amountExpected: 5,
        currency: 'USD',
      }),
    );
    expect(loadVerificationCandidateEmails).not.toHaveBeenCalled();
    expect(evaluateExactAuthorization).not.toHaveBeenCalled();
    expect(pullGmailPubSubMessages).not.toHaveBeenCalled();
    expect(result.verificationMethod).toBe('binance');
    expect(result.authorized).toBe(true);
    expect(result.binanceApi.matchedTransactionId).toBe('428221485342556160');
  });
});
