import type { BankEmailParser } from './parser.interface';
import type { NormalizedInboundEmail, ParsedNotificationResult } from '../types';

import {
  combineEmailText,
  extractAmountAndCurrency,
  extractDateTime,
  extractDestinationLast4,
  extractOriginatorName,
  extractReference,
  inferBankName,
  normalizeDisplayText,
} from '../helpers';

export function genericExtraction(
  email: NormalizedInboundEmail,
  bankNameOverride?: string,
): ParsedNotificationResult {
  const mergedText = combineEmailText(email.bodyText, email.bodyHtml);
  const sourceText = [email.subject ?? '', mergedText].filter(Boolean).join('\n');
  const amountSnapshot = extractAmountAndCurrency(sourceText);
  const reference = extractReference(sourceText);
  const transferAt = extractDateTime(sourceText) ?? email.internalDate ?? null;
  const destinationAccountLast4 = extractDestinationLast4(sourceText);
  const originatorName = extractOriginatorName(sourceText);
  const bankName = bankNameOverride ?? inferBankName(sourceText, email.fromAddress);

  let confidenceScore = 30;
  if (reference) confidenceScore += 20;
  if (amountSnapshot.amount !== null) confidenceScore += 20;
  if (transferAt) confidenceScore += 10;
  if (bankName) confidenceScore += 10;
  if (destinationAccountLast4) confidenceScore += 5;
  if (originatorName) confidenceScore += 5;

  return {
    parserName: bankNameOverride ? `${bankNameOverride.toLowerCase().replace(/\s+/g, '-')}-parser` : 'generic-bank-parser',
    bankName,
    reference,
    amount: amountSnapshot.amount,
    currency: amountSnapshot.currency,
    transferAt,
    sender: email.fromAddress ?? null,
    subject: normalizeDisplayText(email.subject),
    destinationAccountLast4,
    originatorName,
    confidenceScore: Math.min(confidenceScore, 100),
    extractedData: {
      sourceTextPreview: sourceText.slice(0, 400),
    },
  };
}

export const genericBankParser: BankEmailParser = {
  name: 'generic-bank-parser',
  canParse() {
    return 10;
  },
  parse(email) {
    return genericExtraction(email);
  },
};
