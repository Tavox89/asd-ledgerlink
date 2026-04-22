import type { CurrencyCode } from '@ledgerlink/shared';

export interface NormalizedHeader {
  name: string;
  value: string;
}

export interface NormalizedInboundEmail {
  gmailMessageId: string;
  gmailThreadId?: string | null;
  historyId?: string | null;
  snippet?: string | null;
  internalDate?: Date | null;
  subject?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  replyToAddress?: string | null;
  returnPathAddress?: string | null;
  messageIdHeader?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  headers: NormalizedHeader[];
  headerMap: Record<string, string[]>;
}

export interface ParsedNotificationResult {
  parserName: string;
  bankName?: string | null;
  reference?: string | null;
  amount?: number | null;
  currency?: CurrencyCode | null;
  transferAt?: Date | null;
  sender?: string | null;
  subject?: string | null;
  destinationAccountLast4?: string | null;
  originatorName?: string | null;
  confidenceScore: number;
  extractedData: Record<string, unknown>;
}

export interface ParsedSignalSnapshot {
  text: string;
  subject: string;
  fromAddress: string | null;
}
