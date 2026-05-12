import { describe, expect, it } from 'vitest';

import { normalizeCaptureExtraction } from './capture-extraction';

describe('normalizeCaptureExtraction', () => {
  it('normalizes pago movil fields and matches the expected amount', () => {
    const result = normalizeCaptureExtraction({
      companySlug: 'default',
      request: {
        method: 'pago_movil',
        ledgerMethod: 'pago_movil',
        amount: 1,
        currency: 'VES',
        paymentDate: '2026-04-16',
        imageDataUrl: `data:image/png;base64,${Buffer.from('fake-image').toString('base64')}`,
      },
      vision: {
        isTransferProof: true,
        reference: ' 907126 ',
        customerName: 'Gustavo Gonzalez',
        amount: 1,
        currency: 'VES',
        date: '2026-04-16',
        time: null,
        bank: null,
        originBank: '0134',
        destinationBank: '0102',
        clientId: 'V-00000000',
        phoneNumber: '0412 134 0001',
        confidence: 91,
        rawText: 'Pago movil 907126 monto 1,00',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe('pago_movil');
    expect(result.fields).toMatchObject({
      reference: '907126',
      bankOrigin: '0134',
      bankDestination: '0102',
      customerDocument: 'V00000000',
      customerPhone: '04121340001',
      amount: 1,
      currency: 'VES',
    });
    expect(result.amountMatch).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it('flags amount mismatch without changing extracted fields', () => {
    const result = normalizeCaptureExtraction({
      companySlug: 'default',
      request: {
        method: 'transferencia_directa',
        ledgerMethod: 'transferencia_directa',
        amount: 20,
        currency: 'VES',
        paymentDate: '2026-04-16',
        imageDataUrl: `data:image/jpeg;base64,${Buffer.from('fake-image').toString('base64')}`,
      },
      vision: {
        isTransferProof: true,
        reference: 'ABC123',
        customerName: null,
        amount: 10,
        currency: 'VES',
        date: '2026-04-16',
        time: null,
        bank: null,
        originBank: 'Banesco',
        destinationBank: null,
        clientId: 'J123456789',
        phoneNumber: null,
        confidence: 84,
        rawText: 'Transferencia ABC123 monto 10',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.amountMatch).toBe(false);
    expect(result.warnings).toContain('El monto detectado no coincide con el monto esperado.');
    expect(result.fields.bankOrigin).toBe('Banesco');
  });

  it('uses zelle profile without requiring bank fields', () => {
    const result = normalizeCaptureExtraction({
      companySlug: 'default',
      request: {
        method: 'zelle',
        ledgerMethod: 'zelle',
        amount: 5,
        currency: 'USD',
        paymentDate: '2026-04-16',
        imageDataUrl: `data:image/webp;base64,${Buffer.from('fake-image').toString('base64')}`,
      },
      vision: {
        isTransferProof: true,
        reference: null,
        customerName: 'GIUSEPPE ZACCARIA',
        amount: 5,
        currency: 'USD',
        date: '2026-04-16',
        time: null,
        bank: null,
        confidence: 78,
        rawText: 'Zelle GIUSEPPE ZACCARIA $5',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.fields.payerName).toBe('GIUSEPPE ZACCARIA');
    expect(result.missingFields).toEqual([]);
  });
});
