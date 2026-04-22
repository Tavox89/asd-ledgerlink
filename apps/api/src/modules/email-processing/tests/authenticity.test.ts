import { classifyAllowedSender, evaluateEmailAuthenticity } from '../authenticity';
import { sampleEmailFixtures } from '../fixtures/sample-emails';

const allowlist = [
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
];

describe('email authenticity evaluation', () => {
  it('classifies an exact allowlisted sender as email-level trust', () => {
    const result = classifyAllowedSender(sampleEmailFixtures[0], allowlist);

    expect(result.senderMatchType).toBe('email');
  });

  it('classifies an explicit company domain as domain-level trust', () => {
    const result = classifyAllowedSender(sampleEmailFixtures[1], [
      {
        ...allowlist[0],
        id: 'sender-2',
        bankName: 'Mercantil Banco',
        senderEmail: null,
        senderDomain: 'mercantilbanco.com',
      },
    ]);

    expect(result.senderMatchType).toBe('domain');
  });

  it('returns none for non-allowlisted senders', () => {
    const result = classifyAllowedSender(sampleEmailFixtures[2], allowlist);

    expect(result.senderMatchType).toBe('none');
  });

  it('scores allowlisted authenticated bank email as high confidence', () => {
    const result = evaluateEmailAuthenticity(sampleEmailFixtures[0], allowlist);

    expect(result.authStatus).toBe('high');
    expect(result.authScore).toBeGreaterThanOrEqual(80);
    expect(result.riskFlags).not.toContain('reply_to_mismatch');
  });

  it('treats an exact allowlisted sender as trusted even on a public mailbox domain', () => {
    const result = evaluateEmailAuthenticity(
      {
        ...sampleEmailFixtures[2],
        fromAddress: 'tavox1998@gmail.com',
        replyToAddress: 'tavox1998@gmail.com',
        returnPathAddress: 'tavox1998@gmail.com',
        subject: 'Pago recibido 5050jhf',
        headerMap: {
          ...sampleEmailFixtures[2].headerMap,
          'authentication-results': [
            'mx.google.com; dkim=pass header.i=@gmail.com; spf=pass smtp.mailfrom=gmail.com; dmarc=pass',
          ],
        },
      },
      [
        ...allowlist,
        {
          id: 'sender-2',
          bankName: 'Banco Prueba',
          senderEmail: 'tavox1998@gmail.com',
          senderDomain: 'gmail.com',
          replyToPattern: null,
          returnPathPattern: null,
          messageIdPattern: null,
          notes: null,
          isActive: true,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    );

    expect(result.authStatus).toBe('high');
    expect(result.authScore).toBeGreaterThanOrEqual(80);
    expect(result.riskFlags).not.toContain('suspicious_domain');
    expect(result.flags.sender_allowed).toBe(true);
  });

  it('marks free-mail forwarded message for review risk', () => {
    const result = evaluateEmailAuthenticity(sampleEmailFixtures[2], allowlist);

    expect(result.authStatus).not.toBe('high');
    expect(result.riskFlags).toContain('suspicious_domain');
    expect(result.riskFlags).toContain('reply_to_mismatch');
    expect(result.riskFlags).toContain('authentication_results_unknown');
  });
});
