import { evaluateTransferMatches } from './matching.engine';
import { parseBankNotification } from '../email-processing/parsers';
import { sampleEmailFixtures } from '../email-processing/fixtures/sample-emails';
import { evaluateEmailAuthenticity } from '../email-processing/authenticity';

describe('matching engine', () => {
  it('preconfirms a unique high-confidence candidate with exact signals', () => {
    const parsed = parseBankNotification(sampleEmailFixtures[0]);
    const auth = evaluateEmailAuthenticity(sampleEmailFixtures[0], [
      {
        id: 'sender-1',
        bankName: 'Banesco',
        senderEmail: 'notificaciones@banesco.com',
        senderDomain: 'banesco.com',
        replyToPattern: null,
        returnPathPattern: null,
        messageIdPattern: null,
        notes: null,
        isActive: true,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const matches = evaluateTransferMatches(parsed!, auth, [
      {
        id: 'transfer-1',
        referenceExpected: 'REF879231',
        amountExpected: 1250.5,
        currency: 'VES',
        expectedBank: 'Banesco',
        expectedWindowFrom: new Date('2026-04-17T10:00:00.000Z'),
        expectedWindowTo: new Date('2026-04-17T12:00:00.000Z'),
        destinationAccountLast4: '4821',
        customerName: 'CLUB SAMS CARACAS',
      },
    ]);

    expect(matches[0]?.status).toBe('preconfirmed');
    expect(matches[0]?.score).toBeGreaterThanOrEqual(90);
  });

  it('sends suspicious but otherwise exact evidence to review instead of preconfirming', () => {
    const parsed = parseBankNotification(sampleEmailFixtures[2]);
    const auth = evaluateEmailAuthenticity(sampleEmailFixtures[2], []);

    const matches = evaluateTransferMatches(parsed!, auth, [
      {
        id: 'transfer-3',
        referenceExpected: 'ALRT445900',
        amountExpected: 845.9,
        currency: 'VES',
        expectedBank: 'Banco de Venezuela',
        expectedWindowFrom: new Date('2026-04-17T13:00:00.000Z'),
        expectedWindowTo: new Date('2026-04-17T16:00:00.000Z'),
        destinationAccountLast4: '7744',
        customerName: 'JUAN SALAZAR',
      },
    ]);

    expect(matches[0]?.status).toBe('needs_review');
    expect(matches[0]?.criticalFlags).toContain('suspicious_domain');
  });

  it('preconfirms when the bank is not supplied but the sender is official and auth is high', () => {
    const parsed = parseBankNotification(sampleEmailFixtures[0]);
    const auth = evaluateEmailAuthenticity(sampleEmailFixtures[0], [
      {
        id: 'sender-1',
        bankName: 'Banesco',
        senderEmail: 'notificaciones@banesco.com',
        senderDomain: 'banesco.com',
        replyToPattern: null,
        returnPathPattern: null,
        messageIdPattern: null,
        notes: null,
        isActive: true,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const matches = evaluateTransferMatches(parsed!, auth, [
      {
        id: 'transfer-4',
        referenceExpected: 'REF879231',
        amountExpected: 1250.5,
        currency: 'VES',
        expectedBank: 'Banco no especificado',
        expectedWindowFrom: new Date('2026-04-17T10:00:00.000Z'),
        expectedWindowTo: new Date('2026-04-17T12:00:00.000Z'),
        destinationAccountLast4: null,
        customerName: null,
      },
    ]);

    expect(matches[0]?.status).toBe('preconfirmed');
    expect(matches[0]?.score).toBeGreaterThanOrEqual(85);
  });
});
