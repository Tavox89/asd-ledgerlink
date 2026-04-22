import type { BankEmailParser } from './parser.interface';

import { genericExtraction } from './generic-bank.parser';

export const banescoParser: BankEmailParser = {
  name: 'banesco-parser',
  canParse(email) {
    const text = `${email.subject ?? ''} ${email.fromAddress ?? ''} ${email.bodyText ?? ''}`.toLowerCase();
    return text.includes('banesco') ? 90 : 0;
  },
  parse(email) {
    const base = genericExtraction(email, 'Banesco');
    const specificReference =
      `${email.subject ?? ''}\n${email.bodyText ?? ''}`.match(/(REF\d{6,})/i)?.[1] ??
      base.reference;

    return {
      ...base,
      parserName: 'banesco-parser',
      reference: specificReference,
      confidenceScore: Math.min(base.confidenceScore + 10, 100),
    };
  },
};
