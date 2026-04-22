import { createHash } from 'node:crypto';

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
const prismaMock = {
  integrationApiToken: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('./verifications.service', () => ({
  authorizeVerification,
  lookupVerification,
  createManualVerification,
  listVerifications,
  getVerificationById,
  confirmVerification,
  rejectVerification,
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
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
    prismaMock.integrationApiToken.findUnique.mockResolvedValue(null);
    prismaMock.integrationApiToken.update.mockResolvedValue({});
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

  it('rejects company authorize calls when the bearer token is missing', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    const response = await request(app).post('/companies/default/verifications/authorize').send(validPayload);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('integration_token_missing');
    expect(authorizeVerification).not.toHaveBeenCalled();
  });

  it('allows company authorize calls when the token belongs to the requested company and scope', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    const secret = 'bridge_secret_value_1234567890';
    const token = `legtk_a1b2c3d4e5f6_${secret}`;
    prismaMock.integrationApiToken.findUnique.mockResolvedValue({
      id: 'token-1',
      companyId: 'company-default',
      tokenPrefix: 'legtk_a1b2c3d4e5f6',
      tokenHash: createHash('sha256').update(secret, 'utf8').digest('hex'),
      scopes: ['verifications:authorize'],
      expiresAt: null,
      revokedAt: null,
      company: {
        id: 'company-default',
        slug: 'default',
      },
    });
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

    const response = await request(app)
      .post('/companies/default/verifications/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload);

    expect(response.status).toBe(200);
    expect(authorizeVerification).toHaveBeenCalledWith('default', validPayload);
    expect(prismaMock.integrationApiToken.update).toHaveBeenCalledWith({
      where: {
        id: 'token-1',
      },
      data: {
        lastUsedAt: expect.any(Date),
      },
    });
  });

  it('rejects company lookup calls when the token belongs to another company', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    const secret = 'bridge_secret_value_1234567890';
    const token = `legtk_a1b2c3d4e5f6_${secret}`;
    prismaMock.integrationApiToken.findUnique.mockResolvedValue({
      id: 'token-1',
      companyId: 'company-other',
      tokenPrefix: 'legtk_a1b2c3d4e5f6',
      tokenHash: createHash('sha256').update(secret, 'utf8').digest('hex'),
      scopes: ['verifications:lookup'],
      expiresAt: null,
      revokedAt: null,
      company: {
        id: 'company-other',
        slug: 'other-company',
      },
    });

    const response = await request(app)
      .post('/companies/default/verifications/lookup')
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('integration_token_company_mismatch');
    expect(lookupVerification).not.toHaveBeenCalled();
  });

  it('rejects company lookup calls when the token lacks the lookup scope', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    const secret = 'bridge_secret_value_1234567890';
    const token = `legtk_a1b2c3d4e5f6_${secret}`;
    prismaMock.integrationApiToken.findUnique.mockResolvedValue({
      id: 'token-1',
      companyId: 'company-default',
      tokenPrefix: 'legtk_a1b2c3d4e5f6',
      tokenHash: createHash('sha256').update(secret, 'utf8').digest('hex'),
      scopes: ['verifications:authorize'],
      expiresAt: null,
      revokedAt: null,
      company: {
        id: 'company-default',
        slug: 'default',
      },
    });

    const response = await request(app)
      .post('/companies/default/verifications/lookup')
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('integration_token_insufficient_scope');
    expect(lookupVerification).not.toHaveBeenCalled();
  });
});
