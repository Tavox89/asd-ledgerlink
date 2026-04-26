export const currencyValues = ['VES', 'USD', 'EUR', 'COP'] as const;
export const evidenceStatusValues = [
  'pending',
  'email_received',
  'authenticity_high',
  'match_found',
  'preconfirmed',
  'requires_review',
  'rejected',
  'confirmed_manual',
] as const;
export const matchStatusValues = [
  'no_match',
  'possible_match',
  'strong_match',
  'preconfirmed',
  'needs_review',
  'rejected',
] as const;
export const emailProcessingStatusValues = [
  'received',
  'parsed',
  'matched',
  'needs_review',
  'ignored',
  'rejected',
] as const;
export const authStatusValues = ['unknown', 'low', 'medium', 'high'] as const;
export const reviewStatusValues = ['open', 'resolved', 'rejected', 'escalated'] as const;
export const gmailWatchStatusValues = ['active', 'expired', 'error'] as const;
export const senderMatchTypeValues = ['none', 'email', 'domain'] as const;
export const verificationReasonCodeValues = [
  'authorized',
  'sender',
  'reference',
  'name',
  'amount',
  'date',
  'identity_required',
] as const;
