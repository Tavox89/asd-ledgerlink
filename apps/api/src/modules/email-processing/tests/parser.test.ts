import { parseBankNotification } from '../parsers';
import { genericExtraction } from '../parsers/generic-bank.parser';
import { sampleEmailFixtures } from '../fixtures/sample-emails';
import type { NormalizedInboundEmail } from '../types';

describe('bank notification parser registry', () => {
  it('selects Banesco parser and extracts primary transfer fields', () => {
    const parsed = parseBankNotification(sampleEmailFixtures[0]);

    expect(parsed?.parserName).toBe('banesco-parser');
    expect(parsed?.bankName).toBe('Banesco');
    expect(parsed?.reference).toBe('REF879231');
    expect(parsed?.amount).toBe(1250.5);
    expect(parsed?.currency).toBe('VES');
    expect(parsed?.destinationAccountLast4).toBe('4821');
  });

  it('falls back to Mercantil parser and preserves extracted reference', () => {
    const parsed = parseBankNotification(sampleEmailFixtures[1]);

    expect(parsed?.parserName).toBe('mercantil-parser');
    expect(parsed?.reference).toBe('MTC552100');
    expect(parsed?.currency).toBe('USD');
  });

  it('extracts Zelle-style subject names and amounts without inflating trailing punctuation', () => {
    const email: NormalizedInboundEmail = {
      gmailMessageId: 'amerant-zelle-1',
      gmailThreadId: 'thread-zelle-1',
      historyId: '9001',
      snippet: 'Notification - GUILLERMO DIAZ ORTIZ sent you $10.00.',
      internalDate: new Date('2026-04-23T03:35:00.000Z'),
      subject: 'Notification - GUILLERMO DIAZ ORTIZ sent you $10.00.',
      fromAddress: 'donotreply@amerantbank.com',
      toAddress: 'venezuelaonline2020@gmail.com',
      replyToAddress: 'donotreply@amerantbank.com',
      returnPathAddress: 'donotreply@amerantbank.com',
      messageIdHeader: '<amerant-zelle-1@amerantbank.com>',
      bodyText: 'You have received a new payment notification.',
      bodyHtml: null,
      headers: [],
      headerMap: {},
    };

    const parsed = genericExtraction(email);

    expect(parsed.amount).toBe(10);
    expect(parsed.currency).toBe('USD');
    expect(parsed.originatorName).toBe('GUILLERMO DIAZ ORTIZ');
  });

  it('extracts Amerant Zelle ReferenceID values without matching inside the label', () => {
    const email: NormalizedInboundEmail = {
      gmailMessageId: 'amerant-zelle-reference',
      gmailThreadId: 'thread-zelle-reference',
      historyId: '9002',
      snippet: 'Notification - JOSE GELVEZ MADURO sent you $231.00.',
      internalDate: new Date('2026-04-24T16:35:48.000Z'),
      subject: 'Notification - JOSE GELVEZ MADURO sent you $231.00.',
      fromAddress: 'donotreply@amerantbank.com',
      toAddress: 'venezuelaonline2020@gmail.com',
      replyToAddress: 'donotreply@amerantbank.com',
      returnPathAddress: 'donotreply@amerantbank.com',
      messageIdHeader: '<amerant-zelle-reference@amerantbank.com>',
      bodyText: 'MemberID (73004580)\nAlertID (4452751248)\nReferenceID (760045800)',
      bodyHtml: null,
      headers: [],
      headerMap: {},
    };

    const parsed = genericExtraction(email);

    expect(parsed.reference).toBe('760045800');
  });

  it('extracts Binance incoming transfer evidence with order id, UTC time, and USDT amount normalized to USD', () => {
    const email: NormalizedInboundEmail = {
      gmailMessageId: 'binance-incoming-1',
      gmailThreadId: 'thread-binance-incoming-1',
      historyId: '9003',
      snippet: 'You received an incoming transfer',
      internalDate: new Date('2026-04-26T22:36:08.000Z'),
      subject: 'You received an incoming transfer',
      fromAddress: 'do-not-reply@directmail2.binance.com',
      toAddress: 'ordenesdecompramayorclub@gmail.com',
      replyToAddress: 'do-not-reply@directmail2.binance.com',
      returnPathAddress: 'do-not-reply@directmail2.binance.com',
      messageIdHeader: '<binance-incoming-1@binance.com>',
      bodyText:
        'BINANCE\nYou received an incoming transfer\nTime: 2026-04-26 22:36:08(UTC)\nFrom: Edelynr\nAmount: 5 USDT\nOrder ID: 428221485342556160',
      bodyHtml: null,
      headers: [],
      headerMap: {},
    };

    const parsed = parseBankNotification(email);

    expect(parsed?.parserName).toBe('binance-parser');
    expect(parsed?.bankName).toBe('Binance');
    expect(parsed?.reference).toBe('428221485342556160');
    expect(parsed?.amount).toBe(5);
    expect(parsed?.currency).toBe('USD');
    expect(parsed?.originatorName).toBe('Edelynr');
    expect(parsed?.transferAt?.toISOString()).toBe('2026-04-26T22:36:08.000Z');
    expect(parsed?.extractedData).toMatchObject({
      assetSymbol: 'USDT',
    });
  });
});
