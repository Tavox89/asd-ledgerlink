import { describe, expect, it } from 'vitest';

import {
  buildBlockedReply,
  buildImageFallbackReply,
  buildVerificationStrategies,
  detectVerificationMethod,
  extractVerificationFromText,
  getMissingVerificationFields,
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

  it('extracts Binance order id, alias, USDT amount, and UTC-like date text', () => {
    const result = extractVerificationFromText(
      'Pago 5 USDT exitosamente. Alias: Gedcorp. ID de orden 428221485342556160. Fecha 2026-04-26 22:36',
    );

    expect(result.reference).toBe('428221485342556160');
    expect(result.alias).toBe('Gedcorp');
    expect(result.amount).toBe(5);
    expect(result.currency).toBe('USD');
    expect(result.date).toBe('2026-04-26');
    expect(result.time).toBe('22:36');
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
        alias: 'State Alias',
        amount: 90,
        currency: 'USD',
        bank: 'Banco Estado',
        extractedDate: '2026-04-16',
        extractedTime: '10:00',
      },
      {
        reference: 'TXT-999',
        customerName: 'Texto Nombre',
        alias: 'Texto Alias',
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
        alias: 'Imagen Alias',
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
    expect(merged.alias).toBe('Texto Alias');
    expect(merged.amount).toBe(123);
    expect(merged.currency).toBe('USD');
    expect(merged.bank).toBe('Banco Texto');
    expect(merged.extractedDate).toBe('2026-04-17');
    expect(merged.extractedTime).toBe('14:38');
    expect(merged.currencySource).toBe('text');
  });

  it('does not treat recipient emails from Binance screenshots as payer names', () => {
    const merged = mergeCollectedVerificationInput(
      null,
      extractVerificationFromText(''),
      {
        isTransferProof: true,
        reference: '428221485342556160',
        customerName: 'ordenesdecompramayorclub@gmail.com',
        alias: 'Gedcorp',
        amount: 5,
        currency: 'USD',
        date: null,
        time: null,
        bank: 'Binance',
        confidence: 90,
      },
    );

    expect(merged.customerName).toBeNull();
    expect(merged.alias).toBe('Gedcorp');
    expect(merged.reference).toBe('428221485342556160');
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

  it('treats reference or name as alternative identity fields for WhatsApp collection', () => {
    expect(
      getMissingVerificationFields({
        reference: '000123456124',
        customerName: null,
        amount: null,
        currency: 'USD',
        currencySource: 'default',
        bank: null,
        extractedDate: null,
        extractedTime: null,
      }),
    ).toEqual(['monto']);

    expect(
      getMissingVerificationFields({
        reference: null,
        customerName: null,
        amount: 123,
        currency: 'USD',
        currencySource: 'default',
        bank: null,
        extractedDate: null,
        extractedTime: null,
      }),
    ).toEqual(['referencia o nombre']);
  });

  it('requires only the payment date as the extra Binance WhatsApp field', () => {
    expect(
      getMissingVerificationFields(
        {
          reference: '428557229373358081',
          customerName: null,
          amount: 3,
          currency: 'USD',
          currencySource: 'image',
          bank: 'Binance',
          extractedDate: null,
          extractedTime: null,
        },
        'binance',
      ),
    ).toEqual(['fecha del pago']);

    expect(
      getMissingVerificationFields(
        {
          reference: '428557229373358081',
          customerName: null,
          amount: 3,
          currency: 'USD',
          currencySource: 'image',
          bank: 'Binance',
          extractedDate: '2026-04-26',
          extractedTime: null,
        },
        'binance',
      ),
    ).toEqual([]);
  });

  it('asks for reference or name when image extraction is insufficient', () => {
    expect(buildImageFallbackReply()).toContain('referencia o nombre');
  });

  it('uses Binance-specific blocked reasons instead of Gmail sender wording', () => {
    const reply = buildBlockedReply(
      'binance',
      {
        reference: '428221485342556160',
        customerName: null,
        alias: 'Gedcorp',
        amount: 5,
        currency: 'USD',
        currencySource: 'image',
        bank: 'Binance',
        extractedDate: null,
        extractedTime: null,
      },
      'sender',
      'momento de verificacion',
      {
        binanceApiErrorCode:
          "0:Service unavailable from a restricted location according to 'b. Eligibility'",
      },
    );

    expect(reply).toContain('Binance API rechazo la consulta por restriccion de ubicacion o IP');
    expect(reply).not.toContain('remitente del correo');
  });

  it('detects Binance on the shared WhatsApp channel using capture/text signals', () => {
    const textExtraction = extractVerificationFromText(
      'Pago 5 USDT exitosamente. Alias: Gedcorp. ID de orden 428221485342556160. Fecha 2026-04-26 22:36',
    );
    const merged = mergeCollectedVerificationInput(
      null,
      textExtraction,
      {
        isTransferProof: true,
        reference: '428221485342556160',
        customerName: 'Edelynr',
        alias: 'Gedcorp',
        amount: 5,
        currency: 'USD',
        date: '2026-04-26',
        time: '22:36',
        bank: 'Binance',
        confidence: 94,
        rawText: '{"bank":"Binance"}',
      },
    );

    expect(
      detectVerificationMethod({
        textExtraction,
        imageExtraction: {
          isTransferProof: true,
          reference: '428221485342556160',
          customerName: 'Edelynr',
          alias: 'Gedcorp',
          amount: 5,
          currency: 'USD',
          date: '2026-04-26',
          time: '22:36',
          bank: 'Binance',
          confidence: 94,
          rawText: '{"bank":"Binance"}',
        },
        mergedInput: merged,
      }),
    ).toBe('binance');
  });
});
