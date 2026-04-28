import { describe, expect, it } from 'vitest';

import {
  buildBinancePayRequestWindow,
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
  it('authorizes by exact Binance order id without customer name', () => {
    const result = evaluateBinancePayTransactions(buildSpec(), [buildTransaction()], 'receiver-1');

    expect(result.authorized).toBe(true);
    expect(result.reasonCode).toBe('authorized');
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
});
