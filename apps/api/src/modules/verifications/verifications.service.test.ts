import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateManualVerificationInput } from '@ledgerlink/shared';

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
});
