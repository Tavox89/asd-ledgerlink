import type { NormalizedInboundEmail } from '../types';

import { banescoParser } from './banesco.parser';
import { genericBankParser } from './generic-bank.parser';
import { mercantilParser } from './mercantil.parser';

const parserRegistry = [banescoParser, mercantilParser, genericBankParser];

function isBinanceEmail(email: NormalizedInboundEmail) {
  const source = `${email.subject ?? ''}\n${email.fromAddress ?? ''}\n${email.bodyText ?? ''}\n${email.bodyHtml ?? ''}`.toLowerCase();
  return source.includes('binance');
}

export function parseBankNotification(email: NormalizedInboundEmail) {
  if (isBinanceEmail(email)) {
    return null;
  }

  const selectedParser = parserRegistry
    .map((parser) => ({ parser, score: parser.canParse(email) }))
    .sort((left, right) => right.score - left.score)[0]?.parser;

  return selectedParser?.parse(email) ?? genericBankParser.parse(email);
}
