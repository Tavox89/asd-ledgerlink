import { describe, expect, it } from 'vitest';

import {
  createAllowedBankSenderSchema,
  createExpectedTransferSchema,
  createManualVerificationSchema,
  gmailPullSchema,
  gmailSyncRecentSchema,
} from './index';

describe('shared DTO validation', () => {
  it('accepts a valid expected transfer payload', () => {
    const parsed = createExpectedTransferSchema.parse({
      referenciaEsperada: 'REF123456',
      montoEsperado: 120,
      moneda: 'VES',
      bancoEsperado: 'Banesco',
      fechaEsperadaDesde: '2026-04-17T10:00:00.000Z',
      fechaEsperadaHasta: '2026-04-17T11:00:00.000Z',
      cuentaDestinoUltimos4: '4821',
    });

    expect(parsed.referenciaEsperada).toBe('REF123456');
  });

  it('rejects invalid allowed sender payloads', () => {
    expect(() =>
      createAllowedBankSenderSchema.parse({
        bankName: 'A',
      }),
    ).toThrow();
  });

  it('coerces pull payload defaults', () => {
    const parsed = gmailPullSchema.parse({
      maxMessages: '12',
    });

    expect(parsed.maxMessages).toBe(12);
  });

  it('accepts a manual Gmail sync payload', () => {
    const parsed = gmailSyncRecentSchema.parse({
      maxMessages: '8',
      query: 'from:gmail newer_than:1d',
    });

    expect(parsed.maxMessages).toBe(8);
    expect(parsed.query).toBe('from:gmail newer_than:1d');
  });

  it('accepts a manual verification payload and applies defaults', () => {
    const parsed = createManualVerificationSchema.parse({
      referenciaEsperada: 'REF-9981',
      montoEsperado: '200',
      fechaOperacion: '2026-04-17T16:30:00.000Z',
    });

    expect(parsed.moneda).toBe('USD');
    expect(parsed.toleranciaMinutos).toBe(180);
  });

  it('normalizes empty optional form fields to null', () => {
    const verification = createManualVerificationSchema.parse({
      referenciaEsperada: 'REF-9981',
      montoEsperado: '200',
      fechaOperacion: '2026-04-17T16:30:00.000Z',
      bancoEsperado: '',
      cuentaDestinoUltimos4: '',
      nombreClienteOpcional: '',
      notas: '',
    });

    const sender = createAllowedBankSenderSchema.parse({
      bankName: 'Banesco',
      senderEmail: '',
      senderDomain: '',
    });

    expect(verification.bancoEsperado).toBeNull();
    expect(verification.cuentaDestinoUltimos4).toBeNull();
    expect(verification.nombreClienteOpcional).toBeNull();
    expect(sender.senderEmail).toBeNull();
    expect(sender.senderDomain).toBeNull();
  });
});
