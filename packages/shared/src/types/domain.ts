import type {
  authStatusValues,
  currencyValues,
  emailProcessingStatusValues,
  evidenceStatusValues,
  gmailWatchStatusValues,
  matchStatusValues,
  reviewStatusValues,
  senderMatchTypeValues,
  verificationReasonCodeValues,
} from '../constants/statuses';

export type CurrencyCode = (typeof currencyValues)[number];
export type EvidenceStatus = (typeof evidenceStatusValues)[number];
export type EmailProcessingStatus = (typeof emailProcessingStatusValues)[number];
export type MatchStatus = (typeof matchStatusValues)[number];
export type AuthStatus = (typeof authStatusValues)[number];
export type ReviewStatus = (typeof reviewStatusValues)[number];
export type GmailWatchStatus = (typeof gmailWatchStatusValues)[number];
export type SenderMatchType = (typeof senderMatchTypeValues)[number];
export type VerificationReasonCode = (typeof verificationReasonCodeValues)[number];

export interface CompanySummary {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  notes?: string | null;
}

export interface MatchReason {
  code: string;
  label: string;
  weight: number;
  matched: boolean;
  detail?: string;
}

export interface AuthEvaluationResult {
  authScore: number;
  authStatus: AuthStatus;
  riskFlags: string[];
  flags: Record<string, boolean | 'unknown'>;
}
