import { describe, expect, it } from 'vitest';

import {
  buildVerificationStrategies,
  extractVerificationFromText,
  mergeCollectedVerificationInput,
} from './whatsapp.helpers';

describe('whatsapp helpers', () => {
  it('extracts reference, amount, and natural-language date from free text', () => {
    const result = extractVerificationFromText(
      'Comprobante. Nombre: Guillermo Diaz. Monto: 123.00 USD. Numero de Referencia: 000123456124. Fecha: 17 de abril de 2026 2:38 pm.',
    );

    expect(result.customerName).toBe('Guillermo Diaz');
    expect(result.reference).toBe('000123456124');
    expect(result.amount).toBe(123);
    expect(result.currency).toBe('USD');
    expect(result.date).toBe('2026-04-17');
    expect(result.time).toBe('14:38');
  });

  it('extracts date when the month is written without "de"', () => {
    const result = extractVerificationFromText(
      'Nombre Guillermo Diaz ref 000123456711 monto 168 fecha 19 abril 2026',
    );

    expect(result.customerName).toBe('Guillermo Diaz');
    expect(result.reference).toBe('000123456711');
    expect(result.amount).toBe(168);
    expect(result.date).toBe('2026-04-19');
    expect(result.time).toBeNull();
  });

  it('prefers the enrolled-as name from Zelle-like text', () => {
    const result = extractVerificationFromText(
      'Sending $10.00 to Guillermo diaz Enrolled as GUILLERMO DIAZ ORTIZ From Checking - 4277 Send date Today',
      new Date('2026-04-21T15:00:00.000Z'),
    );

    expect(result.customerName).toBe('GUILLERMO DIAZ ORTIZ');
    expect(result.amount).toBe(10);
    expect(result.date).toBe('2026-04-21');
  });

  it('prioritizes typed text over image extraction and previous state', () => {
    const merged = mergeCollectedVerificationInput(
      {
        reference: 'STATE-001',
        customerName: 'State Name',
        amount: 90,
        currency: 'USD',
        bank: 'Banco Estado',
        extractedDate: '2026-04-16',
        extractedTime: '10:00',
      },
      {
        reference: 'TXT-999',
        customerName: 'Texto Nombre',
        amount: 123,
        currency: 'USD',
        bank: 'Banco Texto',
        date: '2026-04-17',
        time: '14:38',
        confidence: 80,
        rawText: 'txt',
      },
      {
        isTransferProof: true,
        reference: 'IMG-555',
        customerName: 'Imagen Nombre',
        amount: 111,
        currency: 'VES',
        bank: 'Banco Imagen',
        date: '2026-04-15',
        time: '09:15',
        confidence: 92,
      },
    );

    expect(merged.reference).toBe('TXT-999');
    expect(merged.customerName).toBe('Texto Nombre');
    expect(merged.amount).toBe(123);
    expect(merged.currency).toBe('USD');
    expect(merged.bank).toBe('Banco Texto');
    expect(merged.extractedDate).toBe('2026-04-17');
    expect(merged.extractedTime).toBe('14:38');
    expect(merged.currencySource).toBe('text');
  });

  it('builds a whole-day secondary strategy when only the date is available', () => {
    const strategies = buildVerificationStrategies(
      {
        reference: '000123456124',
        customerName: 'Guillermo Diaz',
        amount: 123,
        currency: 'USD',
        currencySource: 'default',
        bank: null,
        extractedDate: '2026-04-17',
        extractedTime: null,
      },
      new Date('2026-04-21T15:00:00.000Z'),
    );

    expect(strategies).toHaveLength(2);
    expect(strategies[0]?.code).toBe('verification_moment');
    expect(strategies[1]).toMatchObject({
      code: 'extracted_date_day',
      toleranciaMinutos: 720,
    });
  });
});
