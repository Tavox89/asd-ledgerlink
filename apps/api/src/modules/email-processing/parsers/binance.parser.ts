import type { BankEmailParser } from './parser.interface';
import type { NormalizedInboundEmail, ParsedNotificationResult } from '../types';

import {
  combineEmailText,
  extractAmountAndCurrency,
  extractDateTime,
  extractOriginatorName,
  extractReference,
  normalizeDisplayText,
} from '../helpers';

function buildSourceText(email: NormalizedInboundEmail) {
  const mergedText = combineEmailText(email.bodyText, email.bodyHtml);
  return [email.subject ?? '', mergedText].filter(Boolean).join('\n');
}

export const binanceParser: BankEmailParser = {
  name: 'binance-parser',
  canParse(email) {
    const source = `${email.subject ?? ''}\n${email.fromAddress ?? ''}\n${email.bodyText ?? ''}\n${email.bodyHtml ?? ''}`.toLowerCase();
    let score = 0;

    if (source.includes('binance')) score += 50;
    if (source.includes('incoming transfer')) score += 20;
    if (source.includes('usdt')) score += 10;
    if (source.includes('order id') || source.includes('id de orden')) score += 10;

    return score;
  },
  parse(email): ParsedNotificationResult | null {
    const sourceText = buildSourceText(email);
    const amountSnapshot = extractAmountAndCurrency(sourceText);
    const reference = extractReference(sourceText);
    const transferAt = extractDateTime(sourceText) ?? email.internalDate ?? null;
    const originatorName = extractOriginatorName(sourceText);
    const assetSymbol = /\bUSDT\b/i.test(sourceText) ? 'USDT' : null;

    let confidenceScore = 45;
    if (reference) confidenceScore += 20;
    if (amountSnapshot.amount !== null) confidenceScore += 20;
    if (transferAt) confidenceScore += 10;
    if (originatorName) confidenceScore += 5;

    return {
      parserName: 'binance-parser',
      bankName: 'Binance',
      reference,
      amount: amountSnapshot.amount,
      currency: amountSnapshot.currency,
      transferAt,
      sender: email.fromAddress ?? null,
      subject: normalizeDisplayText(email.subject),
      destinationAccountLast4: null,
      originatorName,
      confidenceScore: Math.min(confidenceScore, 100),
      extractedData: {
        assetSymbol,
        sourceTextPreview: sourceText.slice(0, 400),
      },
    };
  },
};
