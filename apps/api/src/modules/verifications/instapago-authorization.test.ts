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
    apiBaseUrl: 'https://merchant.instapago.com/services/api',
    keyId: 'key-id',
    publicKeyId: 'public-key-id',
    defaultReceiptBank: '0134',
    defaultOriginBank: null,
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
      expect.stringContaining('/v2/Payments/p2p/GetPayment?'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(prismaMock.paymentProviderVerificationAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorized: true,
          reasonCode: 'authorized',
          providerRequest: expect.objectContaining({
            params: expect.objectContaining({
              keyId: '[redacted]',
              publickeyid: '[redacted]',
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
      rif: 'V12345678',
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
      'https://merchant.instapago.com/services/api/v2/Transfers/p2c',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: expect.stringContaining('amount=25.50'),
      }),
    );
  });

  it('blocks duplicate provider responses', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');
    mockJsonResponse({
      success: false,
      code: '401',
      message: 'El pago ya ha sido validado',
    });

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'pago_movil',
      payload: buildPagoMovilPayload(),
      mode: 'authorize',
    });

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('duplicate');
    expect(result.riskFlags).toContain('instapago_duplicate_validation');
  });

  it('keeps lookup local and does not call the provider when no previous attempt exists', async () => {
    const { evaluateInstapagoAuthorization } = await import('./instapago-authorization');

    const result = await evaluateInstapagoAuthorization({
      companyId: 'company-default',
      method: 'pago_movil',
      payload: buildPagoMovilPayload(),
      mode: 'lookup',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.authorized).toBe(false);
    expect(result.paymentProviderApi.checked).toBe(false);
    expect(result.riskFlags).toContain('payment_provider_lookup_local_only');
  });
});
