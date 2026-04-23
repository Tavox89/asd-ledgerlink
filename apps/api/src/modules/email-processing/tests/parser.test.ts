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
});
