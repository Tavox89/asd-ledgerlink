import { describe, expect, it } from 'vitest';

import {
  createAllowedBankSenderSchema,
  createExpectedTransferSchema,
  createManualVerificationSchema,
  gmailMessagesQuerySchema,
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

  it('accepts expected transfer amounts with comma decimals', () => {
    const parsed = createExpectedTransferSchema.parse({
      referenciaEsperada: 'REF123456',
      montoEsperado: '59,24',
      moneda: 'USD',
      bancoEsperado: 'Banesco',
      fechaEsperadaDesde: '2026-04-17T10:00:00.000Z',
      fechaEsperadaHasta: '2026-04-17T11:00:00.000Z',
    });

    expect(parsed.montoEsperado).toBe(59.24);
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

  it('accepts a Gmail message query filtered by buzón', () => {
    const parsed = gmailMessagesQuerySchema.parse({
      page: '2',
      gmailAccountId: 'gmail-account-2',
    });

    expect(parsed.page).toBe(2);
    expect(parsed.gmailAccountId).toBe('gmail-account-2');
  });

  it('accepts a manual verification payload and applies defaults', () => {
    const parsed = createManualVerificationSchema.parse({
      montoEsperado: '200',
      fechaOperacion: '2026-04-17T16:30:00.000Z',
    });

    expect(parsed.moneda).toBe('USD');
    expect(parsed.toleranciaMinutos).toBe(180);
    expect(parsed.referenciaEsperada).toBeUndefined();
  });

  it('accepts a manual verification amount with comma decimals', () => {
    const parsed = createManualVerificationSchema.parse({
      montoEsperado: '59,24',
      fechaOperacion: '2026-04-17T16:30:00.000Z',
    });

    expect(parsed.montoEsperado).toBe(59.24);
  });

  it('normalizes empty optional form fields to null', () => {
    const verification = createManualVerificationSchema.parse({
      referenciaEsperada: '',
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

    expect(verification.referenciaEsperada).toBeNull();
    expect(verification.bancoEsperado).toBeNull();
    expect(verification.cuentaDestinoUltimos4).toBeNull();
    expect(verification.nombreClienteOpcional).toBeNull();
    expect(sender.senderEmail).toBeNull();
    expect(sender.senderDomain).toBeNull();
  });
});
