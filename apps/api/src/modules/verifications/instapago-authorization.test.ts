import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDecryptedInstapagoConfig = vi.fn();
const prismaMock = {
  paymentProviderVerificationAttempt: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('../payment-providers/payment-providers.service', () => ({
  INSTAPAGO_PROVIDER: 'INSTAPAGO',
  getDecryptedInstapagoConfig,
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));

const fetchMock = vi.fn();
global.fetch = fetchMock;

function buildConfig() {
  return {
    id: 'config-1',
    companyId: 'company-default',
    provider: 'INSTAPAGO',
    isActive: true,
    transportMode: 'DIRECT',
    apiBaseUrl: 'https://merchant.instapago.com/services/api',
    keyId: 'key-id',
    publicKeyId: 'public-key-id',
    proxyBaseUrl: null,
    proxyToken: null,
    defaultReceiptBank: '0134',
    defaultOriginBank: null,
  };
}

function buildProxyConfig() {
  return {
    ...buildConfig(),
    transportMode: 'PROXY',
    keyId: null,
    publicKeyId: null,
    proxyBaseUrl: 'https://clubsamsve.com/wp-json/asd-instapago-proxy/v1',
    proxyToken: 'proxy-secret-token',
  };
}

function buildPagoMovilPayload(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function mockJsonResponse(payload: unknown, status = 200) {
  fetchMock.mockResolvedValue({
    status,
    text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  });
}

describe('InstaPago authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDecryptedInstapagoConfig.mockResolvedValue(buildConfig());
    prismaMock.paymentProviderVerificationAttempt.findUnique.mockResolvedValue(null);
    prismaMock.paymentProviderVerificationAttempt.findFirst.mockResolvedValue(null);
    prismaMock.paymentProviderVerificationAttempt.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'attempt-1',
        companyId: data.companyId,
        company: {
          id: data.companyId,
          slug: 'default',
        },
        ...data,
        createdAt: new Date('2023-10-17T12:00:00.000Z'),
        updatedAt: new Date('2023-10-17T12:00:00.000Z'),
      }),
    );
  });

  it('authorizes Pago Movil when InstaPago confirms exact reference, amount, date, banks and customer data', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse({
      success: true,
      code: '201',
      message: 'Se ha encontrado un pago, exitosamente',
      reference: '028251997974',
      referencedest: '028251997974',
      bank: '0134',
      receiptbank: '0134',
      phonenumberclient: '00584240000000',
      rif: 'V0000000',
      amount: '1.00',
      date: '2023-10-17',
    });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'pago_movil',
      payload: buildPagoMovilPayload(),
      mode: 'authorize',
    });

    expect(result.authorized).toBe(true);
    expect(result.reasonCode).toBe('authorized');
    expect(result.paymentProviderApi.providerCode).toBe('201');
    expect(result.paymentProviderApi.matchedReference).toBe('028251997974');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v2/Payments/p2p/ValidatePayment?'),
      expect.objectContaining({ method: 'GET' }),
    );
    const [requestUrl] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestUrl)).toContain('clientid=V0000000');
    expect(prismaMock.paymentProviderVerificationAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorized: true,
          reasonCode: 'authorized',
          providerRequest: expect.objectContaining({
            params: expect.objectContaining({
              KeyId: '[redacted]',
              PublicKeyId: '[redacted]',
              clientid: '[redacted-client-id]',
              phonenumberclient: '[redacted-phone]',
            }),
          }),
        }),
      }),
    );
  });

  it('authorizes Transferencia Directa with form-url-encoded provider request', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse({
      success: true,
      code: '201',
      message: 'Se ha encontrado un pago, exitosamente',
      reference: 'TRF123456',
      referencedest: 'TRF123456',
      bank: '0102',
      receiptbank: '0134',
      clientid: 'V12345678',
      amount: '25.50',
      date: '2023-10-17',
    });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'transferencia_directa',
      payload: {
        referenciaEsperada: 'TRF123456',
        montoEsperado: 25.5,
        moneda: 'VES',
        fechaPago: '2023-10-17',
        fechaOperacion: null,
        bancoOrigen: '0102',
        bancoDestino: '0134',
        cedulaCliente: 'V12345678',
        telefonoCliente: null,
        nombreClienteOpcional: null,
        notas: null,
        externalRequestId: null,
      },
      mode: 'authorize',
    });

    expect(result.authorized).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://merchant.instapago.com/services/api/v2/Transfers/p2c/Validate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: expect.stringContaining('amount=25.50'),
      }),
    );
    const [, transferRequest] = fetchMock.mock.calls[0] ?? [];
    expect(String((transferRequest as RequestInit).body)).toContain('clientId=V12345678');
  });

  it('uses the non-destructive Pago Movil GetPayment endpoint for lookup', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse({
      success: true,
      code: '201',
      message: 'Se ha encontrado un pago, exitosamente',
      reference: '028251997974',
      referencedest: '028251997974',
      bank: '0134',
      receiptbank: '0134',
      phonenumberclient: '00584240000000',
      rif: 'V0000000',
      amount: '1.00',
      date: '2023-10-17',
    });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'pago_movil',
      payload: buildPagoMovilPayload(),
      mode: 'lookup',
    });

    expect(result.authorized).toBe(true);
    expect(result.reasonCode).toBe('authorized');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v2/Payments/p2p/GetPayment?'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('authorizes Pago Movil through the configured proxy transport', async () => {
    getDecryptedInstapagoConfig.mockResolvedValue(buildProxyConfig());
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse({
      httpStatus: 200,
      payload: {
        success: true,
        code: '201',
        message: 'Se ha encontrado un pago, exitosamente',
        reference: '028251997974',
        referencedest: '028251997974',
        bank: '0134',
        receiptbank: '0134',
        phonenumberclient: '00584240000000',
        amount: '1.00',
        date: '2023-10-17',
      },
    });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'pago_movil',
      payload: buildPagoMovilPayload(),
      mode: 'authorize',
    });

    expect(result.authorized).toBe(true);
    expect(result.paymentProviderApi.transportMode).toBe('proxy');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://clubsamsve.com/wp-json/asd-instapago-proxy/v1/pago-movil/validate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer proxy-secret-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const [, proxyRequest] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String((proxyRequest as RequestInit).body))).toMatchObject({
      referenceExpected: '028251997974',
      amountExpected: 1,
      paymentDate: '2023-10-17',
      destinationBank: '0134',
    });
    expect(prismaMock.paymentProviderVerificationAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerRequest: expect.objectContaining({
            transportMode: 'proxy',
            body: expect.objectContaining({
              clientId: '[redacted-client-id]',
              phoneNumber: '[redacted-phone]',
            }),
          }),
          providerResponse: expect.objectContaining({
            transportMode: 'proxy',
          }),
        }),
      }),
    );
  });

  it('uses the non-destructive proxy lookup endpoint for Transferencia Directa', async () => {
    getDecryptedInstapagoConfig.mockResolvedValue(buildProxyConfig());
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse({
      httpStatus: 200,
      payload: {
        success: true,
        code: '201',
        message: 'Se ha encontrado una transferencia, exitosamente',
        reference: 'TRF123456',
        referencedest: 'TRF123456',
        bank: '0102',
        receiptbank: '0134',
        clientid: 'V12345678',
        amount: '25.50',
        date: '2023-10-17',
      },
    });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'transferencia_directa',
      payload: {
        referenciaEsperada: 'TRF123456',
        montoEsperado: 25.5,
        moneda: 'VES',
        fechaPago: '2023-10-17',
        fechaOperacion: null,
        bancoOrigen: '0102',
        bancoDestino: '0134',
        cedulaCliente: 'V12345678',
        telefonoCliente: null,
        nombreClienteOpcional: null,
        notas: null,
        externalRequestId: null,
      },
      mode: 'lookup',
    });

    expect(result.authorized).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://clubsamsve.com/wp-json/asd-instapago-proxy/v1/transferencia-directa/lookup',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns provider_error when the proxy rejects the request', async () => {
    getDecryptedInstapagoConfig.mockResolvedValue(buildProxyConfig());
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse(
      {
        httpStatus: 403,
        payload: {
          success: false,
          code: '403',
          message: 'Token no autorizado',
        },
      },
      403,
    );

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'pago_movil',
      payload: buildPagoMovilPayload(),
      mode: 'authorize',
    });

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('provider_error');
    expect(result.paymentProviderApi.transportMode).toBe('proxy');
    expect(result.paymentProviderApi.providerCode).toBe('403');
    expect(prismaMock.paymentProviderVerificationAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorized: false,
          reasonCode: 'provider_error',
        }),
      }),
    );
  });

  it('does not treat provider commerce rif as the payer client document', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse({
      success: true,
      code: '201',
      message: 'Se ha encontrado un pago, exitosamente',
      id: 'ddfe3890-0111-4734-be0a-d14a2985fb7e',
      phonenumber: '00584126385534',
      rif: 'J000000401878105',
      reference: '907126',
      referencedest: '907126',
      bank: '0134',
      phonenumberclient: '00584121340001',
      amount: '1.00',
    });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'pago_movil',
      payload: buildPagoMovilPayload({
        referenciaEsperada: '907126',
        fechaPago: '2026-04-16',
        cedulaCliente: 'V00000000',
        telefonoCliente: '00584121340001',
      }),
      mode: 'lookup',
    });

    expect(result.authorized).toBe(true);
    expect(result.reasonCode).toBe('authorized');
    expect(result.paymentProviderApi.evidence?.clientIdMatched).toBe('unknown');
    expect(result.paymentProviderApi.matchedReference).toBe('907126');
  });

  it('uses the destructive Pago Movil ValidatePayment endpoint only for authorize', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse({
      success: true,
      code: '201',
      message: 'Se ha validado un pago, exitosamente',
      reference: '028251997974',
      bank: '0134',
      receiptbank: '0134',
      phonenumberclient: '00584240000000',
      rif: 'V0000000',
      amount: '1.00',
      date: '2023-10-17',
    });

    await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'pago_movil',
      payload: buildPagoMovilPayload(),
      mode: 'authorize',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v2/Payments/p2p/ValidatePayment?'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('blocks Pago Movil duplicate provider responses even when success is true', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse({
      success: true,
      code: '401',
      message: 'El pago ya ha sido validado',
      reference: '028251997974',
      referencedest: '028251997974',
      bank: '0134',
      receiptbank: '0134',
      phonenumberclient: '00584240000000',
      clientid: 'V0000000',
      amount: '1.00',
      date: '2023-10-17',
    });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'pago_movil',
      payload: buildPagoMovilPayload(),
      mode: 'authorize',
    });

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('duplicate');
    expect(result.paymentProviderApi.providerCode).toBe('401');
    expect(result.paymentProviderApi.providerMessage).toBe('El pago ya ha sido validado');
    expect(result.paymentProviderApi.transactionCount).toBe(0);
    expect(result.paymentProviderApi.evidence).toMatchObject({
      referenceMatched: true,
      amountMatched: true,
      dateMatched: true,
      clientId: '[redacted-client-id]',
      phoneNumber: '[redacted-phone]',
    });
    expect(result.riskFlags).toContain('instapago_duplicate_validation');
    expect(prismaMock.paymentProviderVerificationAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorized: false,
          reasonCode: 'duplicate',
          providerCode: '401',
          providerMessage: 'El pago ya ha sido validado',
          providerResponse: expect.objectContaining({
            payload: expect.objectContaining({
              code: '401',
              message: 'El pago ya ha sido validado',
              clientid: '[redacted-client-id]',
              phonenumberclient: '[redacted-phone]',
            }),
          }),
        }),
      }),
    );
  });

  it('blocks Transferencia Directa duplicate provider responses even when success is true', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse({
      success: true,
      code: '401',
      message: 'El pago ya ha sido validado',
      reference: 'TRF123456',
      referencedest: 'TRF123456',
      bank: '0102',
      receiptbank: '0134',
      clientid: 'V12345678',
      amount: '25.50',
      date: '2023-10-17',
    });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'transferencia_directa',
      payload: {
        referenciaEsperada: 'TRF123456',
        montoEsperado: 25.5,
        moneda: 'VES',
        fechaPago: '2023-10-17',
        fechaOperacion: null,
        bancoOrigen: '0102',
        bancoDestino: '0134',
        cedulaCliente: 'V12345678',
        telefonoCliente: null,
        nombreClienteOpcional: null,
        notas: null,
        externalRequestId: null,
      },
      mode: 'authorize',
    });

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('duplicate');
    expect(result.paymentProviderApi.providerCode).toBe('401');
    expect(result.paymentProviderApi.providerMessage).toBe('El pago ya ha sido validado');
    expect(result.paymentProviderApi.transactionCount).toBe(0);
    expect(result.riskFlags).toContain('instapago_duplicate_validation');
  });

  it('uses the non-destructive Transferencia Directa p2c endpoint for lookup', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse({
      success: true,
      code: '201',
      message: 'Se ha encontrado una transferencia, exitosamente',
      reference: 'TRF123456',
      bank: '0102',
      receiptbank: '0134',
      clientid: 'V12345678',
      amount: '25.50',
      date: '2023-10-17',
    });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'transferencia_directa',
      payload: {
        referenciaEsperada: 'TRF123456',
        montoEsperado: 25.5,
        moneda: 'VES',
        fechaPago: '2023-10-17',
        fechaOperacion: null,
        bancoOrigen: '0102',
        bancoDestino: '0134',
        cedulaCliente: 'V12345678',
        telefonoCliente: null,
        nombreClienteOpcional: null,
        notas: null,
        externalRequestId: null,
      },
      mode: 'lookup',
    });

    expect(result.authorized).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://merchant.instapago.com/services/api/v2/Transfers/p2c',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('enriches Transferencia Directa evidence from the received-transfer list', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          success: true,
          code: '201',
          message: 'Se ha encontrado un pago, exitosamente',
          reference: '01214991',
          referencedest: '01214991',
          bank: '0134',
          amount: '10.00',
          date: '2023-10-30',
        })),
      })
      .mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          success: true,
          code: '201',
          payments: JSON.stringify([
            {
              date: '2023-10-30T00:00:00',
              reference: '01214991',
              bankemi: '0134',
              bankrecep: '0114',
              clientId: 'V20839247',
              amount: 10,
            },
          ]),
        })),
      });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'transferencia_directa',
      payload: {
        referenciaEsperada: '01214991',
        montoEsperado: 10,
        moneda: 'VES',
        fechaPago: '2023-10-30',
        fechaOperacion: null,
        bancoOrigen: '0134',
        bancoDestino: '0114',
        cedulaCliente: 'V20839247',
        telefonoCliente: null,
        nombreClienteOpcional: null,
        notas: null,
        externalRequestId: null,
      },
      mode: 'lookup',
    });

    expect(result.authorized).toBe(true);
    expect(result.paymentProviderApi.evidence?.clientIdMatched).toBe(true);
    expect(result.paymentProviderApi.evidence?.destinationBankMatched).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v2/Transfers/p2c/List?'),
      expect.objectContaining({ method: 'GET' }),
    );
    const [listUrl] = fetchMock.mock.calls[1] ?? [];
    expect(String(listUrl)).toContain('startdate=2023-10-30');
    expect(String(listUrl)).toContain('enddate=2023-10-31');
  });

  it('blocks Transferencia Directa when supplemental list confirms a different client document', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          success: true,
          code: '201',
          message: 'Se ha encontrado un pago, exitosamente',
          reference: '01214991',
          referencedest: '01214991',
          bank: '0134',
          amount: '10.00',
          date: '2023-10-30',
        })),
      })
      .mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          success: true,
          code: '201',
          payments: JSON.stringify([
            {
              date: '2023-10-30T00:00:00',
              reference: '01214991',
              bankemi: '0134',
              bankrecep: '0114',
              clientId: 'V20839247',
              amount: 10,
            },
          ]),
        })),
      });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'transferencia_directa',
      payload: {
        referenciaEsperada: '01214991',
        montoEsperado: 10,
        moneda: 'VES',
        fechaPago: '2023-10-30',
        fechaOperacion: null,
        bancoOrigen: '0134',
        bancoDestino: '0114',
        cedulaCliente: 'V10000000',
        telefonoCliente: null,
        nombreClienteOpcional: null,
        notas: null,
        externalRequestId: null,
      },
      mode: 'lookup',
    });

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('name');
    expect(result.paymentProviderApi.evidence?.clientIdMatched).toBe(false);
  });
});
