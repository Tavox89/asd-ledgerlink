import type { NormalizedInboundEmail } from '../types';

import { banescoParser } from './banesco.parser';
import { genericBankParser } from './generic-bank.parser';
import { mercantilParser } from './mercantil.parser';

const parserRegistry = [banescoParser, mercantilParser, genericBankParser];

export function parseBankNotification(email: NormalizedInboundEmail) {
  const selectedParser = parserRegistry
    .map((parser) => ({ parser, score: parser.canParse(email) }))
    .sort((left, right) => right.score - left.score)[0]?.parser;

  return selectedParser?.parse(email) ?? genericBankParser.parse(email);
}
