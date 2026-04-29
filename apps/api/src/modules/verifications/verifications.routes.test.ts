import { createHash } from 'node:crypto';

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../../middleware/error-handler';

const authorizeVerification = vi.fn();
const authorizeBinanceVerification = vi.fn();
const authorizePagoMovilVerification = vi.fn();
const authorizeTransferenciaDirectaVerification = vi.fn();
const lookupVerification = vi.fn();
const lookupBinanceVerification = vi.fn();
const lookupPagoMovilVerification = vi.fn();
const lookupTransferenciaDirectaVerification = vi.fn();
const operatorLookupPagoMovilVerification = vi.fn();
const operatorLookupTransferenciaDirectaVerification = vi.fn();
const createManualVerification = vi.fn();
const createManualBinanceVerification = vi.fn();
const createManualPagoMovilVerification = vi.fn();
const createManualTransferenciaDirectaVerification = vi.fn();
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
  authorizeBinanceVerification,
  authorizePagoMovilVerification,
  authorizeTransferenciaDirectaVerification,
  lookupVerification,
  lookupBinanceVerification,
  lookupPagoMovilVerification,
  lookupTransferenciaDirectaVerification,
  operatorLookupPagoMovilVerification,
  operatorLookupTransferenciaDirectaVerification,
  createManualVerification,
  createManualBinanceVerification,
  createManualPagoMovilVerification,
  createManualTransferenciaDirectaVerification,
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

const validBinancePayload = {
  referenciaEsperada: '428221485342556160',
  montoEsperado: 5,
  moneda: 'USD',
  fechaOperacion: '2026-04-26T22:36:08.000Z',
  toleranciaMinutos: 180,
  bancoEsperado: null,
  cuentaDestinoUltimos4: null,
  nombreClienteOpcional: 'Edelynr',
  notas: 'Source: whatsapp',
};

const validPagoMovilPayload = {
  referenciaEsperada: '028251997974',
  montoEsperado: '1,00',
  moneda: 'VES',
  fechaPago: '2023-10-17',
  bancoOrigen: '0134',
  bancoDestino: '0134',
  cedulaCliente: 'V0000000',
  telefonoCliente: '+584240000000',
  nombreClienteOpcional: null,
  notas: null,
};

const validTransferenciaPayload = {
  referenciaEsperada: '028251997974',
  montoEsperado: 1,
  moneda: 'VES',
  fechaPago: '2023-10-17',
  bancoOrigen: '0134',
  bancoDestino: '0134',
  cedulaCliente: 'V0000000',
  nombreClienteOpcional: null,
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

  it('accepts authorize requests without a reference value', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    authorizeVerification.mockResolvedValue({
      authorized: false,
      reasonCode: 'name',
      candidateCount: 0,
      evidence: null,
    });

    const response = await request(app).post('/verifications/authorize').send({
      ...validPayload,
      referenciaEsperada: '',
    });

    expect(response.status).toBe(200);
    expect(authorizeVerification).toHaveBeenCalledWith('default', {
      ...validPayload,
      referenciaEsperada: null,
    });
    expect(response.body).toMatchObject({
      authorized: false,
      reasonCode: 'name',
    });
  });

  it('normalizes authorize amounts sent with comma decimals', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    authorizeVerification.mockResolvedValue({
      authorized: true,
      reasonCode: 'authorized',
      candidateCount: 1,
      evidence: null,
    });

    const response = await request(app).post('/verifications/authorize').send({
      ...validPayload,
      montoEsperado: '59,24',
    });

    expect(response.status).toBe(200);
    expect(authorizeVerification).toHaveBeenCalledWith('default', {
      ...validPayload,
      montoEsperado: 59.24,
    });
  });

  it('returns a clear non-authorizable decision when both reference and name are empty', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    authorizeVerification.mockResolvedValue({
      authorized: false,
      reasonCode: 'identity_required',
      candidateCount: 0,
      evidence: null,
    });

    const response = await request(app).post('/verifications/authorize').send({
      ...validPayload,
      referenciaEsperada: '',
      nombreClienteOpcional: '',
    });

    expect(response.status).toBe(200);
    expect(authorizeVerification).toHaveBeenCalledWith('default', {
      ...validPayload,
      referenciaEsperada: null,
      nombreClienteOpcional: null,
    });
    expect(response.body).toMatchObject({
      authorized: false,
      reasonCode: 'identity_required',
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

  it('routes POST /verifications/binance/authorize through the Binance authorization service', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    authorizeBinanceVerification.mockResolvedValue({
      companyId: 'company-default',
      companySlug: 'default',
      verificationMethod: 'binance',
      authorized: true,
      reasonCode: 'authorized',
      candidateCount: 1,
      senderMatchType: 'none',
      evidence: null,
      binanceApi: {
        checked: true,
        configured: true,
        transactionCount: 1,
        matchedTransactionId: '428221485342556160',
        matchMode: 'reference_only',
        dateStrategy: 'exact_window',
        evidence: null,
      },
      autoRefresh: { attempted: false, status: 'not_needed', pulled: 0, processed: 0 },
    });

    const response = await request(app).post('/verifications/binance/authorize').send(validBinancePayload);

    expect(response.status).toBe(200);
    expect(authorizeBinanceVerification).toHaveBeenCalledWith('default', validBinancePayload);
    expect(response.body).toMatchObject({
      verificationMethod: 'binance',
      authorized: true,
      reasonCode: 'authorized',
    });
  });

  it('keeps POST /companies/:companySlug/verifications/binance/operator-lookup wired to the Binance operator summary flow', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    lookupBinanceVerification.mockResolvedValue({
      id: 'lookup-binance',
      persisted: false,
      verificationMethod: 'binance',
      status: 'match_found',
      authorized: true,
      reasonCode: 'authorized',
      senderMatchType: 'none',
      candidateCount: 1,
      evidence: null,
      transfer: {
        id: 'lookup-binance',
        referenceExpected: '428221485342556160',
        amountExpected: 5,
        currency: 'USD',
        expectedBank: 'Binance',
        expectedWindowFrom: '2026-04-26T19:36:08.000Z',
        expectedWindowTo: '2026-04-27T01:36:08.000Z',
        destinationAccountLast4: null,
        customerName: 'Edelynr',
        notes: 'Source: whatsapp',
        status: 'match_found',
        matchCount: 1,
      },
      canTreatAsConfirmed: true,
      bestMatch: null,
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: true,
      riskFlags: [],
      matchCount: 1,
      autoRefresh: { attempted: false, status: 'not_needed', pulled: 0, processed: 0 },
      createdAt: '2026-04-26T22:36:08.000Z',
      updatedAt: '2026-04-26T22:36:08.000Z',
    });

    const response = await request(app)
      .post('/companies/default/verifications/binance/operator-lookup')
      .send(validBinancePayload);

    expect(response.status).toBe(200);
    expect(lookupBinanceVerification).toHaveBeenCalledWith('default', validBinancePayload);
    expect(response.body).toMatchObject({
      verificationMethod: 'binance',
      authorized: true,
      reasonCode: 'authorized',
    });
  });

  it('routes the Binance manual endpoint through the API-only Binance flow', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    createManualBinanceVerification.mockResolvedValue({
      id: 'lookup',
      persisted: false,
      verificationMethod: 'binance',
      status: 'preconfirmed',
      authorized: true,
      reasonCode: 'authorized',
      senderMatchType: 'none',
      candidateCount: 1,
      evidence: null,
      binanceApi: {
        checked: true,
        configured: true,
        transactionCount: 1,
        matchedTransactionId: '428221485342556160',
        matchMode: 'reference_only',
        dateStrategy: 'exact_window',
        evidence: null,
      },
      transfer: {
        id: 'lookup',
        referenceExpected: '428221485342556160',
        amountExpected: 5,
        currency: 'USD',
        expectedBank: 'Binance',
        expectedWindowFrom: '2026-04-26T19:36:08.000Z',
        expectedWindowTo: '2026-04-27T01:36:08.000Z',
        destinationAccountLast4: null,
        customerName: 'Edelynr',
        notes: 'Source: whatsapp',
        status: 'preconfirmed',
        matchCount: 1,
      },
      canTreatAsConfirmed: true,
      bestMatch: null,
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: 'unknown',
      riskFlags: [],
      matchCount: 0,
      autoRefresh: { attempted: false, status: 'not_needed', pulled: 0, processed: 0 },
      createdAt: '2026-04-26T22:36:08.000Z',
      updatedAt: '2026-04-26T22:36:08.000Z',
    });

    const response = await request(app).post('/verifications/binance/manual').send(validBinancePayload);

    expect(response.status).toBe(201);
    expect(createManualBinanceVerification).toHaveBeenCalledWith('default', validBinancePayload);
    expect(response.body).toMatchObject({
      verificationMethod: 'binance',
      status: 'preconfirmed',
    });
  });

  it('routes Pago Movil operator lookup through the InstaPago provider flow', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    operatorLookupPagoMovilVerification.mockResolvedValue({
      id: 'lookup',
      persisted: false,
      verificationMethod: 'pago_movil',
      status: 'preconfirmed',
      authorized: true,
      reasonCode: 'authorized',
      senderMatchType: 'none',
      candidateCount: 1,
      evidence: null,
      paymentProviderApi: {
        provider: 'instapago',
        method: 'pago_movil',
        checked: true,
        configured: true,
        providerCode: '201',
        providerMessage: 'Se ha encontrado un pago, exitosamente',
        matchedReference: '028251997974',
        transactionCount: 1,
        evidence: null,
      },
      transfer: {
        id: 'lookup',
        referenceExpected: '028251997974',
        amountExpected: 1,
        currency: 'VES',
        expectedBank: 'Pago Movil InstaPago',
        expectedWindowFrom: '2023-10-17T00:00:00.000Z',
        expectedWindowTo: '2023-10-17T23:59:59.999Z',
        destinationAccountLast4: '0134',
        customerName: 'V0000000',
        notes: null,
        status: 'preconfirmed',
        matchCount: 1,
      },
      canTreatAsConfirmed: true,
      bestMatch: null,
      strongestEmail: null,
      strongestAuthStatus: 'high',
      strongestAuthScore: 100,
      officialSenderMatched: true,
      riskFlags: [],
      matchCount: 1,
      autoRefresh: { attempted: false, status: 'not_needed', pulled: 0, processed: 0 },
      createdAt: '2023-10-17T12:00:00.000Z',
      updatedAt: '2023-10-17T12:00:00.000Z',
    });

    const response = await request(app)
      .post('/companies/default/verifications/pago-movil/operator-lookup')
      .send(validPagoMovilPayload);

    expect(response.status).toBe(200);
    expect(operatorLookupPagoMovilVerification).toHaveBeenCalledWith('default', {
      ...validPagoMovilPayload,
      montoEsperado: 1,
    });
    expect(response.body).toMatchObject({
      verificationMethod: 'pago_movil',
      authorized: true,
      reasonCode: 'authorized',
    });
  });

  it('routes Transferencia Directa manual through the InstaPago provider flow', async () => {
    const { verificationsRouter } = await import('./verifications.routes');
    const app = express();
    app.use(express.json());
    app.use(verificationsRouter);
    app.use(errorHandler);

    createManualTransferenciaDirectaVerification.mockResolvedValue({
      id: 'lookup',
      persisted: false,
      verificationMethod: 'transferencia_directa',
      status: 'pending',
      authorized: false,
      reasonCode: 'duplicate',
      senderMatchType: 'none',
      candidateCount: 0,
      evidence: null,
      paymentProviderApi: {
        provider: 'instapago',
        method: 'transferencia_directa',
        checked: true,
        configured: true,
        providerCode: '401',
        providerMessage: 'El pago ya ha sido validado',
        matchedReference: null,
        transactionCount: 0,
        evidence: null,
      },
      transfer: {
        id: 'lookup',
        referenceExpected: '028251997974',
        amountExpected: 1,
        currency: 'VES',
        expectedBank: 'Transferencia Directa InstaPago',
        expectedWindowFrom: '2023-10-17T00:00:00.000Z',
        expectedWindowTo: '2023-10-17T23:59:59.999Z',
        destinationAccountLast4: '0134',
        customerName: 'V0000000',
        notes: null,
        status: 'pending',
        matchCount: 0,
      },
      canTreatAsConfirmed: false,
      bestMatch: null,
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: 'unknown',
      riskFlags: ['instapago_duplicate_validation'],
      matchCount: 0,
      autoRefresh: { attempted: false, status: 'not_needed', pulled: 0, processed: 0 },
      createdAt: '2023-10-17T12:00:00.000Z',
      updatedAt: '2023-10-17T12:00:00.000Z',
    });

    const response = await request(app)
      .post('/companies/default/verifications/transferencia-directa/manual')
      .send(validTransferenciaPayload);

    expect(response.status).toBe(201);
    expect(createManualTransferenciaDirectaVerification).toHaveBeenCalledWith('default', validTransferenciaPayload);
    expect(response.body).toMatchObject({
      verificationMethod: 'transferencia_directa',
      reasonCode: 'duplicate',
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
