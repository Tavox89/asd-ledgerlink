import { Prisma } from '@prisma/client';

import type { CreateManualVerificationInput } from '@ledgerlink/shared';

import {
  buildExactAuthorizationSpec,
  evaluateExactAuthorization,
  type VerificationCandidateEmail,
} from './exact-authorization';

function buildInput(overrides: Partial<CreateManualVerificationInput> = {}): CreateManualVerificationInput {
  return {
    referenciaEsperada: 'REF879231',
    montoEsperado: 1250.5,
    moneda: 'VES',
    fechaOperacion: '2026-04-17T10:30:00.000Z',
    toleranciaMinutos: 30,
    bancoEsperado: 'Banesco',
    cuentaDestinoUltimos4: '4821',
    nombreClienteOpcional: 'CLUB SAMS CARACAS',
    notas: null,
    ...overrides,
  };
}

function buildCandidate(
  overrides: Partial<VerificationCandidateEmail> & {
    parsedNotification?: Partial<NonNullable<VerificationCandidateEmail['parsedNotification']>> | null;
  } = {},
): VerificationCandidateEmail {
  const { parsedNotification, ...restOverrides } = overrides;
  const id = restOverrides.id ?? 'email-1';
  const gmailMessageId = restOverrides.gmailMessageId ?? `gmail-${id}`;
  const receivedAt = restOverrides.receivedAt ?? new Date('2026-04-17T10:33:00.000Z');
  const internalDate = restOverrides.internalDate ?? new Date('2026-04-17T10:32:00.000Z');

  return {
    id,
    gmailAccountId: 'gmail-account-1',
    gmailMessageId,
    gmailThreadId: null,
    historyId: '1001',
    snippet: 'Pago recibido',
    internalDate,
    subject: 'Pago recibido',
    fromAddress: 'notificaciones@banesco.com',
    toAddress: 'venezuelaonline2020@gmail.com',
    replyToAddress: 'notificaciones@banesco.com',
    returnPathAddress: 'notificaciones@banesco.com',
    messageIdHeader: `<${gmailMessageId}@banesco.com>`,
    bodyText: null,
    bodyHtml: null,
    rawPayload: null,
    authenticityStatus: 'HIGH',
    authScore: 90,
    authenticityFlags: {
      riskFlags: [],
      flags: {
        sender_allowed: true,
      },
    },
    senderMatchType: 'EMAIL',
    processingStatus: 'MATCHED',
    receivedAt,
    parsedAt: receivedAt,
    matchedAt: receivedAt,
    createdAt: receivedAt,
    updatedAt: receivedAt,
    matches: [],
    parsedNotification:
      parsedNotification === null
        ? null
        : {
            id: `parsed-${id}`,
            inboundEmailId: id,
            parserName: 'banesco-parser',
            bankName: 'Banesco',
            reference: 'REF879231',
            amount: new Prisma.Decimal(1250.5),
            currency: 'VES',
            transferAt: new Date('2026-04-17T10:32:00.000Z'),
            sender: 'notificaciones@banesco.com',
            subject: 'Pago recibido',
            destinationAccountLast4: '4821',
            originatorName: 'CLUB SAMS CARACAS',
            confidenceScore: 90,
            extractedData: {},
            createdAt: receivedAt,
            updatedAt: receivedAt,
            ...parsedNotification,
          },
    ...restOverrides,
  } as VerificationCandidateEmail;
}

describe('exact authorization evaluator', () => {
  it('authorizes an exact sender-allowlisted payment inside the expected window even when the reference is omitted', () => {
    const spec = buildExactAuthorizationSpec('company-default', buildInput({ referenciaEsperada: null }));

    const result = evaluateExactAuthorization(spec, [buildCandidate()]);

    expect(result.authorized).toBe(true);
    expect(result.reasonCode).toBe('authorized');
    expect(result.candidateCount).toBe(1);
    expect(result.senderMatchType).toBe('email');
    expect(result.evidence?.gmailMessageId).toBe('gmail-email-1');
  });

  it('rejects when the normalized sender name matches but the amount does not', () => {
    const spec = buildExactAuthorizationSpec('company-default', buildInput());

    const result = evaluateExactAuthorization(spec, [
      buildCandidate({
        parsedNotification: {
          amount: new Prisma.Decimal(999.99),
        },
      }),
    ]);

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('amount');
    expect(result.candidateCount).toBe(0);
  });

  it('matches the sender name exactly while ignoring case and accents', () => {
    const spec = buildExactAuthorizationSpec(
      'company-default',
      buildInput({
        referenciaEsperada: null,
        nombreClienteOpcional: 'guillermo diaz ortiz',
      }),
    );

    const result = evaluateExactAuthorization(spec, [
      buildCandidate({
        parsedNotification: {
          reference: null,
          originatorName: 'GUILLÉRMO DÍAZ ORTIZ',
        },
      }),
    ]);

    expect(result.authorized).toBe(true);
    expect(result.reasonCode).toBe('authorized');
    expect(result.evidence?.originatorName).toBe('GUILLÉRMO DÍAZ ORTIZ');
  });

  it('authorizes when the evidence name is a strong subset of the provided full name', () => {
    const spec = buildExactAuthorizationSpec(
      'company-default',
      buildInput({
        referenciaEsperada: null,
        nombreClienteOpcional: 'GUILLERMO DIAZ ORTIZ',
      }),
    );

    const result = evaluateExactAuthorization(spec, [
      buildCandidate({
        parsedNotification: {
          reference: null,
          originatorName: 'Guillermo Diaz',
        },
      }),
    ]);

    expect(result.authorized).toBe(true);
    expect(result.reasonCode).toBe('authorized');
    expect(result.evidence?.originatorName).toBe('Guillermo Diaz');
  });

  it('rejects partial single-token name overlaps to avoid weak matches', () => {
    const spec = buildExactAuthorizationSpec(
      'company-default',
      buildInput({
        referenciaEsperada: null,
        nombreClienteOpcional: 'GUILLERMO DIAZ ORTIZ',
      }),
    );

    const result = evaluateExactAuthorization(spec, [
      buildCandidate({
        parsedNotification: {
          reference: null,
          originatorName: 'Guillermo',
        },
      }),
    ]);

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('name');
  });

  it('rejects when exact payment evidence falls outside the expected window', () => {
    const spec = buildExactAuthorizationSpec('company-default', buildInput());

    const result = evaluateExactAuthorization(spec, [
      buildCandidate({
        parsedNotification: {
          transferAt: new Date('2026-04-17T12:05:00.000Z'),
        },
        internalDate: new Date('2026-04-17T12:05:00.000Z'),
        receivedAt: new Date('2026-04-17T12:05:30.000Z'),
      }),
    ]);

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('date');
    expect(result.candidateCount).toBe(0);
  });

  it('uses inbox arrival time instead of the parsed body timestamp for the date window', () => {
    const spec = buildExactAuthorizationSpec('company-default', buildInput());

    const result = evaluateExactAuthorization(spec, [
      buildCandidate({
        internalDate: new Date('2026-04-17T10:31:00.000Z'),
        receivedAt: new Date('2026-04-17T10:31:30.000Z'),
        parsedNotification: {
          transferAt: new Date('2026-04-15T09:00:00.000Z'),
        },
      }),
    ]);

    expect(result.authorized).toBe(true);
    expect(result.reasonCode).toBe('authorized');
    expect(result.evidence?.arrivalTimestamp).toBe('2026-04-17T10:31:00.000Z');
    expect(result.evidence?.parsedPaymentTimestamp).toBe('2026-04-15T09:00:00.000Z');
  });

  it('never authorizes a matching email when the sender classification is none', () => {
    const spec = buildExactAuthorizationSpec('company-default', buildInput());

    const result = evaluateExactAuthorization(spec, [
      buildCandidate({
        senderMatchType: 'NONE',
        authenticityFlags: {
          riskFlags: ['sender_not_allowlisted'],
          flags: {
            sender_allowed: false,
          },
        },
      }),
    ]);

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('sender');
    expect(result.candidateCount).toBe(0);
    expect(result.evidence?.senderMatchType).toBe('none');
  });

  it('rejects when the sender is allowlisted but the normalized payment name does not match', () => {
    const spec = buildExactAuthorizationSpec(
      'company-default',
      buildInput({
        referenciaEsperada: null,
        nombreClienteOpcional: 'Guillermo Diaz',
      }),
    );

    const result = evaluateExactAuthorization(spec, [
      buildCandidate({
        parsedNotification: {
          reference: null,
          originatorName: 'Pedro Perez',
        },
      }),
    ]);

    expect(result.authorized).toBe(false);
    expect(result.reasonCode).toBe('name');
    expect(result.candidateCount).toBe(0);
  });

  it('chooses evidence deterministically across duplicate exact candidates', () => {
    const spec = buildExactAuthorizationSpec('company-default', buildInput());

    const result = evaluateExactAuthorization(spec, [
      buildCandidate({
        id: 'domain-exact',
        gmailMessageId: 'gmail-domain',
        senderMatchType: 'DOMAIN',
        parsedNotification: {
          transferAt: new Date('2026-04-17T10:30:00.000Z'),
        },
      }),
      buildCandidate({
        id: 'email-closer',
        gmailMessageId: 'gmail-closer',
        senderMatchType: 'EMAIL',
        internalDate: new Date('2026-04-17T10:31:00.000Z'),
        receivedAt: new Date('2026-04-17T10:31:00.000Z'),
        parsedNotification: {
          transferAt: new Date('2026-04-17T10:31:00.000Z'),
        },
      }),
      buildCandidate({
        id: 'email-farther',
        gmailMessageId: 'gmail-farther',
        senderMatchType: 'EMAIL',
        internalDate: new Date('2026-04-17T10:34:00.000Z'),
        receivedAt: new Date('2026-04-17T10:34:00.000Z'),
        parsedNotification: {
          transferAt: new Date('2026-04-17T10:32:00.000Z'),
        },
      }),
    ]);

    expect(result.authorized).toBe(true);
    expect(result.candidateCount).toBe(3);
    expect(result.evidence?.gmailMessageId).toBe('gmail-closer');
    expect(result.evidence?.senderMatchType).toBe('email');
  });
});
