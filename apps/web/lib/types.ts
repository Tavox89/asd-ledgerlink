export interface CompanyRecord {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  gmailAccount?: GmailProfilePayload['account'] | null;
  whatsAppChannel?: {
    id: string;
    phoneNumber: string;
    messagingServiceSid?: string | null;
    allowedTestNumbers: string[];
    isActive: boolean;
  } | null;
}

export interface IntegrationApiTokenRecord {
  companyId?: string | null;
  companySlug?: string | null;
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface IssuedIntegrationApiTokenRecord extends IntegrationApiTokenRecord {
  token: string;
}

export interface DashboardSummary {
  companyId?: string | null;
  companySlug?: string | null;
  gmailConnected: boolean;
  gmailAccount: {
    email: string;
    displayName?: string | null;
  } | null;
  watchStatus:
    | {
        status: string;
        expirationAt: string;
        historyId: string;
      }
    | null;
  counters: {
    processedEmails: number;
    pendingTransfers: number;
    strongMatches: number;
    manualReviews: number;
  };
  recentActivity: AuditLogRecord[];
}

export interface GmailProfilePayload {
  account: {
    companyId?: string | null;
    companySlug?: string | null;
    id: string;
    email: string;
    googleAccountId?: string | null;
    displayName?: string | null;
    hasToken: boolean;
    watch:
      | {
          id: string;
          historyId: string;
          status: string;
          expirationAt: string;
          lastPulledAt?: string | null;
          lastError?: string | null;
          topicName: string;
          subscriptionName: string;
        }
      | null;
  } | null;
  profile?: {
    emailAddress?: string;
    messagesTotal?: number;
    threadsTotal?: number;
    historyId?: string;
  };
}

export interface InboundEmailRecord {
  companyId?: string | null;
  companySlug?: string | null;
  id: string;
  gmailMessageId: string;
  subject?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
  authScore: number;
  authenticityStatus: string;
  authenticityFlags?: {
    riskFlags?: string[];
    flags?: Record<string, boolean | 'unknown'>;
  } | null;
  senderMatchType: string;
  processingStatus: string;
  internalDate?: string | null;
  receivedAt: string;
  parsedNotification?: ParsedNotificationRecord | null;
  matchCount: number;
  headers?: Array<{ id: string; name: string; value: string }>;
}

export interface ParsedNotificationRecord {
  parserName: string;
  bankName?: string | null;
  reference?: string | null;
  amount?: number | null;
  currency?: string | null;
  transferAt?: string | null;
  destinationAccountLast4?: string | null;
  originatorName?: string | null;
  confidenceScore: number;
}

export interface TransferRecord {
  companyId?: string | null;
  companySlug?: string | null;
  id: string;
  referenceExpected: string;
  amountExpected: number;
  currency: string;
  expectedBank: string;
  expectedWindowFrom: string;
  expectedWindowTo: string;
  destinationAccountLast4?: string | null;
  customerName?: string | null;
  notes?: string | null;
  status: string;
  matchCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MatchRecord {
  companyId?: string | null;
  companySlug?: string | null;
  id: string;
  inboundEmailId: string;
  expectedTransferId: string;
  score: number;
  status: string;
  reasons: Array<{ code: string; label: string; matched: boolean; weight: number }>;
  criticalFlags?: string[] | null;
  inboundEmail?: InboundEmailRecord | null;
  expectedTransfer?: TransferRecord | null;
  parsedNotification?: ParsedNotificationRecord | null;
}

export interface ManualReviewRecord {
  companyId?: string | null;
  companySlug?: string | null;
  id: string;
  status: string;
  priority: string;
  notes?: string | null;
  createdAt: string;
  inboundEmail?: InboundEmailRecord | null;
  expectedTransfer?: TransferRecord | null;
  transferMatch?: MatchRecord | null;
}

export interface AuditLogRecord {
  companyId?: string | null;
  companySlug?: string | null;
  id: string;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface AllowedBankSenderRecord {
  companyId?: string | null;
  companySlug?: string | null;
  id: string;
  bankName: string;
  senderEmail?: string | null;
  senderDomain?: string | null;
  notes?: string | null;
  isActive: boolean;
}

export interface VerificationRecord {
  id: string;
  persisted: boolean;
  transfer: TransferRecord;
  status: string;
  authorized: boolean;
  reasonCode: string;
  senderMatchType: string;
  candidateCount: number;
  evidence?: {
    id: string;
    gmailMessageId: string;
    senderMatchType: string;
    senderAddress?: string | null;
    subject?: string | null;
    originatorName?: string | null;
    arrivalTimestamp?: string | null;
    parsedPaymentTimestamp?: string | null;
    receivedAt: string;
    reference?: string | null;
    amount?: number | null;
    currency?: string | null;
    authenticityStatus?: string | null;
    authScore?: number | null;
    riskFlags: string[];
  } | null;
  canTreatAsConfirmed: boolean;
  bestMatch?: MatchRecord | null;
  strongestEmail?: InboundEmailRecord | null;
  strongestAuthStatus?: string | null;
  strongestAuthScore?: number | null;
  officialSenderMatched?: boolean | 'unknown';
  riskFlags: string[];
  autoRefresh?: {
    attempted: boolean;
    status: 'not_needed' | 'retried' | 'no_messages' | 'failed';
    pulled: number;
    processed: number;
  };
  matchCount: number;
  createdAt: string;
  updatedAt: string;
}
