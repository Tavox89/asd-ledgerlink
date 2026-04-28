import { afterEach, describe, expect, it, vi } from 'vitest';

import { env } from '../../config/env';
import {
  buildBinancePayRequestWindow,
  evaluateBinancePayAuthorization,
  evaluateBinancePayTransactions,
  type BinancePayTransaction,
} from './binance-pay-authorization';
import type { ExactAuthorizationSpec } from './exact-authorization';

function buildSpec(overrides: Partial<ExactAuthorizationSpec> = {}): ExactAuthorizationSpec {
  return {
    companyId: 'company-default',
    referenceExpected: '428221485342556160',
    customerNameExpected: null,
    amountExpected: 5,
    currency: 'USD',
    operationAt: new Date('2026-04-26T22:36:08.000Z'),
    expectedWindowFrom: new Date('2026-04-26T19:36:08.000Z'),
    expectedWindowTo: new Date('2026-04-27T01:36:08.000Z'),
    ...overrides,
  };
}

function buildTransaction(overrides: Partial<BinancePayTransaction> = {}): BinancePayTransaction {
  return {
    orderType: 'C2C',
    transactionId: '428221485342556160',
    transactionTime: 1777242968000,
    amount: '5',
    currency: 'USDT',
    payerInfo: {
      name: 'Edelynr',
      binanceId: 'payer-1',
    },
    receiverInfo: {
      name: 'Gedcorp',
      binanceId: 'receiver-1',
      accountId: 'pay-1',
      email: 'ordenesdecompramayorclub@gmail.com',
    },
    ...overrides,
  };
}

describe('Binance Pay authorization', () => {
  afterEach(() => {
    env.BINANCE_VERIFIER_URL = '';
    env.BINANCE_VERIFIER_TOKEN = '';
    vi.restoreAllMocks();
  });

  it('authorizes by exact Binance order id without customer name', () => {
    const result = evaluateBinancePayTransactions(buildSpec(), [buildTransaction()], 'receiver-1');

    expect(result.authorized).toBe(true);
    expect(result.reasonCode).toBe('authorized');
    expect(result.senderMatchType).toBe('none');
    expect(result.binanceApi.evidence?.matchMode).toBe('reference_only');
    expect(result.binanceApi.evidence?.assetSymbol).toBe('USDT');
    expect(result.officialSenderMatched).toBe(true);
  });

  it('authorizes by payer name without order id', () => {
    const result = evaluateBinancePayTransactions(
      buildSpec({
        referenceExpected: null,
        customerNameExpected: 'Edelynr',
      }),
      [buildTransaction()],
      'receiver-1',
    );

    expect(result.authorized).toBe(true);
    expect(result.reasonCode).toBe('authorized');
    expect(result.binanceApi.evidence?.matchMode).toBe('name_only');
  });

  it('prefers both order id and payer name when both match', () => {
    const result = evaluateBinancePayTransactions(
      buildSpec({
        customerNameExpected: 'Edelynr',
      }),
      [buildTransaction()],
      'receiver-1',
    );

    expect(result.authorized).toBe(true);
    expect(result.binanceApi.evidence?.matchMode).toBe('both');
  });

  it('falls back to order id when optional payer name does not match', () => {
    const result = evaluateBinancePayTransactions(
      buildSpec({
        customerNameExpected: 'Nombre Diferente',
      }),
      [buildTransaction()],
      'receiver-1',
    );

    expect(result.authorized).toBe(true);
    expect(result.binanceApi.evidence?.matchMode).toBe('reference_only');
    expect(result.riskFlags).toContain('authorized_via_reference_only');
  });

  it('rejects when no identity is provided', () => {
    const result = evaluateBinancePayTransactions(
      buildSpec({
        referenceExpected: null,
        customerNameExpected: null,
      }),
      [buildTransaction()],
      'receiver-1',
    );

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('identity_required');
  });

  it('rejects by amount when identity matches but amount differs', () => {
    const result = evaluateBinancePayTransactions(buildSpec({ amountExpected: 6 }), [buildTransaction()], 'receiver-1');

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('amount');
  });

  it('rejects by date when no Binance transactions are returned for the queried window', () => {
    const result = evaluateBinancePayTransactions(buildSpec(), [], 'receiver-1');

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('date');
    expect(result.binanceApi.transactionCount).toBe(0);
  });

  it('uses same-day fallback when outside the exact tolerance window', () => {
    const result = evaluateBinancePayTransactions(
      buildSpec({
        expectedWindowFrom: new Date('2026-04-26T20:00:00.000Z'),
        expectedWindowTo: new Date('2026-04-26T21:00:00.000Z'),
      }),
      [buildTransaction()],
      'receiver-1',
    );

    expect(result.authorized).toBe(true);
    expect(result.binanceApi.evidence?.dateStrategy).toBe('same_day');
    expect(result.riskFlags).toContain('authorized_via_same_day');
  });

  it('rejects by sender when the configured receiver does not match', () => {
    const result = evaluateBinancePayTransactions(buildSpec(), [buildTransaction()], 'receiver-2');

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('sender');
    expect(result.officialSenderMatched).toBe(false);
  });

  it('queries the whole business day plus exact tolerance window', () => {
    const window = buildBinancePayRequestWindow(buildSpec());

    expect(window.startTime.toISOString()).toBe('2026-04-26T04:00:00.000Z');
    expect(window.endTime.toISOString()).toBe('2026-04-27T03:59:59.999Z');
  });

  it('uses the remote Binance verifier when configured', async () => {
    env.BINANCE_VERIFIER_URL = 'https://binance-verifier.example.com';
    env.BINANCE_VERIFIER_TOKEN = 'test-verifier-token';

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          authorized: true,
          reasonCode: 'authorized',
          transactionCount: 1,
          matchedTransactionId: '428221485342556160',
          matchMode: 'reference_only',
          dateStrategy: 'exact_window',
          evidence: {
            transactionId: '428221485342556160',
            transactionTime: '2026-04-26T22:36:08.000Z',
            amount: 5,
            currency: 'USD',
            assetSymbol: 'USDT',
            payerName: 'Edelynr',
            receiverMatched: true,
            matchMode: 'reference_only',
            dateStrategy: 'exact_window',
            referenceMatched: true,
            amountMatched: true,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await evaluateBinancePayAuthorization(buildSpec());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://binance-verifier.example.com/verify/binance');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer test-verifier-token',
        'Content-Type': 'application/json',
      }),
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      referenceExpected: '428221485342556160',
      amountExpected: 5,
      currency: 'USD',
      operationAt: '2026-04-26T22:36:08.000Z',
    });
    expect(result.authorized).toBe(true);
    expect(result.binanceApi.provider).toBe('remote');
    expect(result.binanceApi.evidence?.payerName).toBe('Edelynr');
    expect(result.riskFlags).toContain('binance_remote_verifier');
  });

  it('reports a remote verifier configuration error when URL exists without token', async () => {
    env.BINANCE_VERIFIER_URL = 'https://binance-verifier.example.com';
    env.BINANCE_VERIFIER_TOKEN = '';
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const result = await evaluateBinancePayAuthorization(buildSpec());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.authorized).toBe(false);
    expect(result.binanceApi.provider).toBe('remote');
    expect(result.binanceApi.errorCode).toBe('binance_verifier_token_missing');
  });
});
