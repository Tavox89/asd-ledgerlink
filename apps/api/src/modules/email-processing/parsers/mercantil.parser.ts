import type { BankEmailParser } from './parser.interface';

import { genericExtraction } from './generic-bank.parser';

export const mercantilParser: BankEmailParser = {
  name: 'mercantil-parser',
  canParse(email) {
    const text = `${email.subject ?? ''} ${email.fromAddress ?? ''} ${email.bodyText ?? ''}`.toLowerCase();
    return text.includes('mercantil') ? 90 : 0;
  },
  parse(email) {
    const base = genericExtraction(email, 'Mercantil Banco');
    const specificReference =
      `${email.subject ?? ''}\n${email.bodyText ?? ''}`.match(/referencia[:#\s-]*(\d{6,})/i)?.[1] ??
      base.reference;

    return {
      ...base,
      parserName: 'mercantil-parser',
      reference: specificReference,
      confidenceScore: Math.min(base.confidenceScore + 10, 100),
    };
  },
};
