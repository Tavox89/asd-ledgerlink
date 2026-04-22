import type { NormalizedInboundEmail, ParsedNotificationResult } from '../types';

export interface BankEmailParser {
  name: string;
  canParse(email: NormalizedInboundEmail): number;
  parse(email: NormalizedInboundEmail): ParsedNotificationResult | null;
}
