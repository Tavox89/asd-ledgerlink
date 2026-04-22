import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../../middleware/error-handler';

const authorizeVerification = vi.fn();
const lookupVerification = vi.fn();
const createManualVerification = vi.fn();
const listVerifications = vi.fn();
const getVerificationById = vi.fn();
const confirmVerification = vi.fn();
const rejectVerification = vi.fn();

vi.mock('./verifications.service', () => ({
  authorizeVerification,
  lookupVerification,
  createManualVerification,
  listVerifications,
  getVerificationById,
  confirmVerification,
  rejectVerification,
}));

const validPayload = {
  referenciaEsperada: 'REF879231',
  montoEsperado: 1250.5,
  moneda: 'VES',
  fechaOperacion: '2026-04-17T10:30:00.000Z',
  toleranciaMinutos: 30,
  bancoEsperado: 'Banesco',
  cuentaDestinoUltimos4: '4821',
  nombreClienteOpcional: 'CLUB SAMS CARACAS',
  notas: null,
};

describe('verification routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes POST /verifications/authorize through the exact authorization service', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    authorizeVerification.mockResolvedValue({
      authorized: true,
      reasonCode: 'authorized',
      candidateCount: 1,
      evidence: {
        id: 'email-1',
        gmailMessageId: 'gmail-email-1',
        senderMatchType: 'email',
      },
    });

    const response = await request(app).post('/verifications/authorize').send(validPayload);

    expect(response.status).toBe(200);
    expect(authorizeVerification).toHaveBeenCalledWith('default', validPayload);
    expect(response.body).toMatchObject({
      authorized: true,
      reasonCode: 'authorized',
      candidateCount: 1,
    });
  });

  it('keeps POST /verifications/lookup wired to the operator summary flow', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    lookupVerification.mockResolvedValue({
      id: 'lookup',
      persisted: false,
      status: 'match_found',
      authorized: false,
      reasonCode: 'amount',
      senderMatchType: 'email',
      candidateCount: 0,
      evidence: null,
      transfer: {
        id: 'lookup',
        referenceExpected: 'REF879231',
        amountExpected: 1250.5,
        currency: 'VES',
        expectedBank: 'Banesco',
        expectedWindowFrom: '2026-04-17T10:00:00.000Z',
        expectedWindowTo: '2026-04-17T11:00:00.000Z',
        destinationAccountLast4: '4821',
        customerName: 'CLUB SAMS CARACAS',
        notes: null,
        status: 'match_found',
        matchCount: 1,
      },
      canTreatAsConfirmed: false,
      bestMatch: null,
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: 'unknown',
      riskFlags: [],
      matchCount: 1,
      createdAt: '2026-04-17T10:30:00.000Z',
      updatedAt: '2026-04-17T10:30:00.000Z',
    });

    const response = await request(app).post('/verifications/lookup').send(validPayload);

    expect(response.status).toBe(200);
    expect(lookupVerification).toHaveBeenCalledWith('default', validPayload);
    expect(response.body).toMatchObject({
      id: 'lookup',
      status: 'match_found',
      reasonCode: 'amount',
      authorized: false,
    });
  });
});
