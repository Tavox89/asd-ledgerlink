import type { CreateExpectedTransferInput } from '@ledgerlink/shared';

import type { NormalizedInboundEmail } from '../types';

function buildHeaders(values: Array<[string, string]>) {
  return values.map(([name, value]) => ({ name, value }));
}

function buildHeaderMap(headers: Array<{ name: string; value: string }>) {
  return headers.reduce<Record<string, string[]>>((accumulator, header) => {
    const key = header.name.toLowerCase();
    accumulator[key] = [...(accumulator[key] ?? []), header.value];
    return accumulator;
  }, {});
}

function fixtureEmail(input: Omit<NormalizedInboundEmail, 'headers' | 'headerMap'> & {
  headerTuples: Array<[string, string]>;
}): NormalizedInboundEmail {
  const headers = buildHeaders(input.headerTuples);
  return {
    ...input,
    headers,
    headerMap: buildHeaderMap(headers),
  };
}

export const demoExpectedTransfers: CreateExpectedTransferInput[] = [
  {
    referenciaEsperada: 'REF879231',
    montoEsperado: 1250.5,
    moneda: 'VES',
    bancoEsperado: 'Banesco',
    fechaEsperadaDesde: '2026-04-17T10:00:00.000Z',
    fechaEsperadaHasta: '2026-04-17T12:00:00.000Z',
    cuentaDestinoUltimos4: '4821',
    nombreClienteOpcional: 'CLUB SAMS CARACAS',
    notas: 'Pago operativo de muestra',
  },
  {
    referenciaEsperada: 'MTC552100',
    montoEsperado: 240,
    moneda: 'USD',
    bancoEsperado: 'Mercantil Banco',
    fechaEsperadaDesde: '2026-04-17T08:00:00.000Z',
    fechaEsperadaHasta: '2026-04-17T11:00:00.000Z',
    cuentaDestinoUltimos4: '7744',
    nombreClienteOpcional: 'LAURA PEREZ',
    notas: 'Cobro retail en USD',
  },
  {
    referenciaEsperada: 'ALRT445900',
    montoEsperado: 845.9,
    moneda: 'VES',
    bancoEsperado: 'Banco de Venezuela',
    fechaEsperadaDesde: '2026-04-17T13:00:00.000Z',
    fechaEsperadaHasta: '2026-04-17T16:00:00.000Z',
    cuentaDestinoUltimos4: '7744',
    nombreClienteOpcional: 'JUAN SALAZAR',
    notas: 'Caso ambiguo para revision manual',
  },
];

export const sampleEmailFixtures: NormalizedInboundEmail[] = [
  fixtureEmail({
    gmailMessageId: 'demo-gmail-001',
    gmailThreadId: 'thread-001',
    historyId: '1001',
    snippet: 'Transferencia Banesco REF879231 por Bs. 1.250,50',
    internalDate: new Date('2026-04-17T10:32:00.000Z'),
    subject: 'Banesco | Transferencia recibida REF879231',
    fromAddress: 'notificaciones@banesco.com',
    toAddress: 'venezuelaonline2020@gmail.com',
    replyToAddress: 'notificaciones@banesco.com',
    returnPathAddress: 'bounce@banesco.com',
    messageIdHeader: '<msg-demo-001@banesco.com>',
    bodyText: `
      Estimado comercio,
      Se ha recibido una notificacion de transferencia.
      Referencia: REF879231
      Monto: Bs. 1.250,50
      Fecha: 17/04/2026 10:32
      Banco: Banesco
      Cuenta destino terminada en 4821
      Ordenante: CLUB SAMS CARACAS
    `,
    bodyHtml: null,
    headerTuples: [
      ['From', 'notificaciones@banesco.com'],
      ['To', 'venezuelaonline2020@gmail.com'],
      ['Reply-To', 'notificaciones@banesco.com'],
      ['Return-Path', 'bounce@banesco.com'],
      ['Message-Id', '<msg-demo-001@banesco.com>'],
      ['Authentication-Results', 'mx.google.com; dkim=pass header.i=@banesco.com; spf=pass smtp.mailfrom=banesco.com; dmarc=pass'],
    ],
  }),
  fixtureEmail({
    gmailMessageId: 'demo-gmail-002',
    gmailThreadId: 'thread-002',
    historyId: '1002',
    snippet: 'Mercantil confirma referencia MTC552100 por USD 240.00',
    internalDate: new Date('2026-04-17T09:15:00.000Z'),
    subject: 'Mercantil | Confirmacion de pago MTC552100',
    fromAddress: 'alerts@mercantilbanco.com',
    toAddress: 'venezuelaonline2020@gmail.com',
    replyToAddress: 'alerts@mercantilbanco.com',
    returnPathAddress: 'bounce@mercantilbanco.com',
    messageIdHeader: '<msg-demo-002@mercantilbanco.com>',
    bodyText: `
      Hola,
      Confirmamos un pago procesado.
      Referencia: MTC552100
      Monto: USD 240.00
      Fecha: 17/04/2026 09:15
      Banco: Mercantil Banco
      Cuenta destino terminada en 7744
      Ordenante: LAURA PEREZ
    `,
    bodyHtml: null,
    headerTuples: [
      ['From', 'alerts@mercantilbanco.com'],
      ['To', 'venezuelaonline2020@gmail.com'],
      ['Reply-To', 'alerts@mercantilbanco.com'],
      ['Return-Path', 'bounce@mercantilbanco.com'],
      ['Message-Id', '<msg-demo-002@mercantilbanco.com>'],
      ['Authentication-Results', 'mx.google.com; dkim=pass header.i=@mercantilbanco.com; spf=pass smtp.mailfrom=mercantilbanco.com'],
    ],
  }),
  fixtureEmail({
    gmailMessageId: 'demo-gmail-003',
    gmailThreadId: 'thread-003',
    historyId: '1003',
    snippet: 'Fwd: Pago recibido ALRT445900',
    internalDate: new Date('2026-04-17T14:28:00.000Z'),
    subject: 'Fwd: Pago recibido ALRT445900',
    fromAddress: 'alerts.transferencias@gmail.com',
    toAddress: 'venezuelaonline2020@gmail.com',
    replyToAddress: 'soporte@otro-dominio.net',
    returnPathAddress: 'alerts.transferencias@gmail.com',
    messageIdHeader: '<msg-demo-003@gmail.com>',
    bodyText: `
      Pago recibido.
      Referencia: ALRT445900
      Monto: Bs. 845,90
      Fecha: 17/04/2026 14:28
      Banco: Banco de Venezuela
      Cuenta destino terminada en 7744
      Ordenante: JUAN SALAZAR
    `,
    bodyHtml: null,
    headerTuples: [
      ['From', 'alerts.transferencias@gmail.com'],
      ['To', 'venezuelaonline2020@gmail.com'],
      ['Reply-To', 'soporte@otro-dominio.net'],
      ['Return-Path', 'alerts.transferencias@gmail.com'],
      ['Message-Id', '<msg-demo-003@gmail.com>'],
    ],
  }),
  fixtureEmail({
    gmailMessageId: 'demo-gmail-004',
    gmailThreadId: 'thread-004',
    historyId: '1004',
    snippet: 'Fwd: Pago recibido ALRT445900 desde Banco de Venezuela',
    internalDate: new Date('2026-04-17T14:26:00.000Z'),
    subject: 'Fwd: Pago recibido ALRT445900',
    fromAddress: 'alertas@bancodevenezuela.com',
    toAddress: 'venezuelaonline2020@gmail.com',
    replyToAddress: 'soporte@otro-dominio.net',
    returnPathAddress: 'alertas@bancodevenezuela.com',
    messageIdHeader: '<msg-demo-004@bancodevenezuela.com>',
    bodyText: `
      Pago recibido.
      Referencia: ALRT445900
      Monto: Bs. 845,90
      Fecha: 17/04/2026 14:26
      Banco: Banco de Venezuela
      Cuenta destino terminada en 7744
      Ordenante: JUAN SALAZAR
    `,
    bodyHtml: null,
    headerTuples: [
      ['From', 'alertas@bancodevenezuela.com'],
      ['To', 'venezuelaonline2020@gmail.com'],
      ['Reply-To', 'soporte@otro-dominio.net'],
      ['Return-Path', 'alertas@bancodevenezuela.com'],
      ['Message-Id', '<msg-demo-004@bancodevenezuela.com>'],
    ],
  }),
];
