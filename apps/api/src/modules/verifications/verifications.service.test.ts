import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateManualVerificationInput } from '@ledgerlink/shared';

const loadVerificationCandidateEmails = vi.fn();
const evaluateExactAuthorization = vi.fn();
const evaluateBinancePayAuthorization = vi.fn();
const evaluateInstapagoAuthorization = vi.fn();
const pullGmailPubSubMessages = vi.fn();
const getCompanyBySlugOrThrow = vi.fn();
const prismaMock = {
  paymentValidationRecord: {
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  paymentConsumption: {
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

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

vi.mock('./instapago-authorization', () => ({
  evaluateInstapagoAuthorization,
  paymentProviderBankLabel: (method: string) =>
    method === 'pago_movil' ? 'Pago Movil InstaPago' : 'Transferencia Directa InstaPago',
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
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
    validationContext: {
      source: 'openpos',
      orderNumber: 'order-100',
      cashierId: 'cashier-1',
      cashierName: null,
      terminalId: 'POS-1',
      store: 'ClubSams',
      externalRequestId: 'order-100-zelle',
      validatorPhone: null,
    },
    ...overrides,
  };
}

describe('verification service auto-refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.paymentConsumption.findFirst.mockResolvedValue(null);
    prismaMock.paymentValidationRecord.create.mockResolvedValue({ id: 'validation-record-1' });
    prismaMock.paymentValidationRecord.update.mockResolvedValue({});
    prismaMock.paymentConsumption.create.mockResolvedValue({
      id: 'payment-1',
      orderNumber: 'order-100',
      cashierId: 'cashier-1',
      cashierName: null,
      channel: 'OPENPOS',
      createdAt: new Date('2026-04-19T16:44:00.000Z'),
    });
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
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
    expect(result.consumption.status).toBe('consumed');
  });

  it('rejects POS/API authorize without consumption context before reading Gmail evidence', async () => {
    const { authorizeVerification } = await import('./verifications.service');

    await expect(
      authorizeVerification(
        'default',
        buildInput({
          validationContext: undefined,
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'validation_context_required',
    });

    expect(loadVerificationCandidateEmails).not.toHaveBeenCalled();
    expect(evaluateExactAuthorization).not.toHaveBeenCalled();
    expect(pullGmailPubSubMessages).not.toHaveBeenCalled();
  });

  it('blocks a second order from consuming the same authorized payment', async () => {
    const { authorizeVerification } = await import('./verifications.service');

    prismaMock.paymentConsumption.findFirst.mockResolvedValueOnce({
      id: 'payment-previous',
      externalRequestId: 'other-request',
      orderNumber: 'order-99',
      cashierId: 'cashier-99',
      cashierName: 'Caja 99',
      channel: 'OPENPOS',
      createdAt: new Date('2026-04-19T16:00:00.000Z'),
    });
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
        reference: '000123456711',
        amount: 168,
        currency: 'USD',
      },
      strongestEmail: null,
      strongestAuthStatus: 'high',
      strongestAuthScore: 90,
      officialSenderMatched: true,
      riskFlags: [],
      candidateEmails: [],
    });

    const result = await authorizeVerification(
      'default',
      buildInput({
        validationContext: {
          source: 'openpos',
          orderNumber: 'order-100',
          cashierId: 'cashier-1',
          cashierName: null,
          terminalId: 'POS-1',
          store: 'ClubSams',
          externalRequestId: 'order-100-zelle',
          validatorPhone: null,
        },
      }),
    );

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('duplicate');
    expect(result.consumption).toMatchObject({
      status: 'duplicate',
      previous: {
        paymentId: 'payment-previous',
        orderNumber: 'order-99',
        cashierName: 'Caja 99',
      },
    });
  });

  it('treats a repeated authorize for the same order as idempotent', async () => {
    const { authorizeVerification } = await import('./verifications.service');

    prismaMock.paymentConsumption.findFirst.mockResolvedValueOnce({
      id: 'payment-previous',
      externalRequestId: 'order-100-zelle',
      orderNumber: 'order-100',
      cashierId: 'cashier-1',
      cashierName: null,
      channel: 'OPENPOS',
      createdAt: new Date('2026-04-19T16:00:00.000Z'),
    });
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
        reference: '000123456711',
        amount: 168,
        currency: 'USD',
      },
      strongestEmail: null,
      strongestAuthStatus: 'high',
      strongestAuthScore: 90,
      officialSenderMatched: true,
      riskFlags: [],
      candidateEmails: [],
    });

    const result = await authorizeVerification('default', buildInput());

    expect(result.authorized).toBe(true);
    expect(result.consumption).toMatchObject({
      status: 'idempotent',
      paymentId: 'payment-previous',
      idempotent: true,
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

  it('authorizes Pago Movil through the InstaPago provider evaluator without Gmail', async () => {
    const { authorizePagoMovilVerification } = await import('./verifications.service');

    evaluateInstapagoAuthorization.mockResolvedValue({
      authorized: true,
      reasonCode: 'authorized',
      candidateCount: 1,
      senderMatchType: 'none',
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
      strongestEmail: null,
      strongestAuthStatus: 'high',
      strongestAuthScore: 100,
      officialSenderMatched: true,
      riskFlags: [],
    });

    const payload = {
      referenciaEsperada: '028251997974',
      montoEsperado: 1,
      moneda: 'VES' as const,
      fechaPago: '2023-10-17',
      fechaOperacion: null,
      bancoOrigen: '0134',
      bancoDestino: '0134',
      cedulaCliente: 'V0000000',
      telefonoCliente: '+584240000000',
      nombreClienteOpcional: null,
      notas: null,
      externalRequestId: null,
      validationContext: {
        source: 'openpos' as const,
        orderNumber: 'order-200',
        cashierId: 'cashier-2',
        cashierName: null,
        terminalId: 'POS-1',
        store: 'ClubSams',
        externalRequestId: 'order-200-pago-movil',
        validatorPhone: null,
      },
    };

    const result = await authorizePagoMovilVerification('default', payload);

    expect(evaluateInstapagoAuthorization).toHaveBeenCalledWith({
      companyId: 'company-default',
      method: 'pago_movil',
      payload,
      mode: 'authorize',
    });
    expect(loadVerificationCandidateEmails).not.toHaveBeenCalled();
    expect(evaluateExactAuthorization).not.toHaveBeenCalled();
    expect(pullGmailPubSubMessages).not.toHaveBeenCalled();
    expect(result.verificationMethod).toBe('pago_movil');
    expect(result.authorized).toBe(true);
    expect(result.paymentProviderApi.matchedReference).toBe('028251997974');
  });

  it('does not create a consumption when InstaPago reports a provider duplicate', async () => {
    const { authorizePagoMovilVerification } = await import('./verifications.service');

    evaluateInstapagoAuthorization.mockResolvedValue({
      authorized: false,
      reasonCode: 'duplicate',
      candidateCount: 0,
      senderMatchType: 'none',
      evidence: null,
      paymentProviderApi: {
        provider: 'instapago',
        method: 'pago_movil',
        checked: true,
        configured: true,
        providerCode: '401',
        providerMessage: 'El pago ya ha sido validado',
        matchedReference: '028251997974',
        transactionCount: 0,
        evidence: null,
      },
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: 'unknown',
      riskFlags: ['instapago_duplicate_validation'],
    });

    const payload = {
      referenciaEsperada: '028251997974',
      montoEsperado: 1,
      moneda: 'VES' as const,
      fechaPago: '2023-10-17',
      fechaOperacion: null,
      bancoOrigen: '0134',
      bancoDestino: '0134',
      cedulaCliente: 'V0000000',
      telefonoCliente: '+584240000000',
      nombreClienteOpcional: null,
      notas: null,
      externalRequestId: null,
      validationContext: {
        source: 'openpos' as const,
        orderNumber: 'order-201',
        cashierId: 'cashier-2',
        cashierName: null,
        terminalId: 'POS-1',
        store: 'ClubSams',
        externalRequestId: 'order-201-pago-movil',
        validatorPhone: null,
      },
    };

    const result = await authorizePagoMovilVerification('default', payload);

    expect(result.authorized).toBe(false);
    expect(result.decision).toBe('deny');
    expect(result.reasonCode).toBe('duplicate');
    expect(result.providerCode).toBe('401');
    expect(result.providerMessage).toBe('El pago ya ha sido validado');
    expect(result.message).toBe('El pago ya fue validado anteriormente por el canal bancario.');
    expect(result.consumption).toMatchObject({
      status: 'duplicate',
    });
    expect(prismaMock.paymentConsumption.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.paymentValidationRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DUPLICATE',
          authorized: false,
          reasonCode: 'duplicate',
        }),
      }),
    );
  });

  it('attaches a previous local consumption when the provider duplicate matches an already consumed payment', async () => {
    const { authorizePagoMovilVerification } = await import('./verifications.service');

    prismaMock.paymentConsumption.findFirst.mockResolvedValueOnce({
      id: 'payment-previous',
      externalRequestId: 'order-200-pago-movil',
      orderNumber: 'order-200',
      cashierId: 'cashier-2',
      cashierName: 'Maria',
      channel: 'OPENPOS',
      createdAt: new Date('2023-10-17T16:00:00.000Z'),
    });
    evaluateInstapagoAuthorization.mockResolvedValue({
      authorized: false,
      reasonCode: 'duplicate',
      candidateCount: 0,
      senderMatchType: 'none',
      evidence: null,
      paymentProviderApi: {
        provider: 'instapago',
        method: 'pago_movil',
        checked: true,
        configured: true,
        providerCode: '401',
        providerMessage: 'El pago ya ha sido validado',
        matchedReference: '028251997974',
        transactionCount: 0,
        evidence: null,
      },
      strongestEmail: null,
      strongestAuthStatus: null,
      strongestAuthScore: null,
      officialSenderMatched: 'unknown',
      riskFlags: ['instapago_duplicate_validation'],
    });

    const result = await authorizePagoMovilVerification('default', {
      referenciaEsperada: '028251997974',
      montoEsperado: 1,
      moneda: 'VES',
      fechaPago: '2023-10-17',
      fechaOperacion: null,
      bancoOrigen: '0134',
      bancoDestino: '0134',
      cedulaCliente: 'V0000000',
      telefonoCliente: '+584240000000',
      nombreClienteOpcional: null,
      notas: null,
      externalRequestId: null,
      validationContext: {
        source: 'openpos',
        orderNumber: 'order-202',
        cashierId: 'cashier-9',
        cashierName: null,
        terminalId: 'POS-2',
        store: 'ClubSams',
        externalRequestId: 'order-202-pago-movil',
        validatorPhone: null,
      },
    });

    expect(result.authorized).toBe(false);
    expect(result.decision).toBe('deny');
    expect(result.reasonCode).toBe('duplicate');
    expect(result.message).toBe('El pago ya fue validado anteriormente por el canal bancario.');
    expect(result.consumption).toMatchObject({
      status: 'duplicate',
      previous: {
        paymentId: 'payment-previous',
        orderNumber: 'order-200',
        cashierName: 'Maria',
        channel: 'openpos',
      },
    });
    expect(prismaMock.paymentConsumption.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects POS/API provider authorize without consumption context before calling InstaPago', async () => {
    const { authorizePagoMovilVerification } = await import('./verifications.service');

    const payload = {
      referenciaEsperada: '028251997974',
      montoEsperado: 1,
      moneda: 'VES' as const,
      fechaPago: '2023-10-17',
      fechaOperacion: null,
      bancoOrigen: '0134',
      bancoDestino: '0134',
      cedulaCliente: 'V0000000',
      telefonoCliente: '+584240000000',
      nombreClienteOpcional: null,
      notas: null,
      externalRequestId: null,
      validationContext: undefined,
    };

    await expect(authorizePagoMovilVerification('default', payload)).rejects.toMatchObject({
      statusCode: 400,
      code: 'validation_context_required',
    });

    expect(evaluateInstapagoAuthorization).not.toHaveBeenCalled();
  });
});
