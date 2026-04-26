import type {
  AllowedBankSender,
  AuditLog,
  CompanyProfile,
  ExpectedTransfer,
  GmailAccount,
  GmailToken,
  GmailWatch,
  IntegrationApiToken,
  InboundEmail,
  ManualReview,
  ParsedBankNotification,
  Prisma,
  TransferMatch,
  WhatsAppChannel,
  WhatsAppConversation,
  WhatsAppInboundMessage,
  WhatsAppVerificationAttempt,
} from '@prisma/client';

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  if (!value) {
    return null;
  }

  return Number(value);
}

function enumToClientValue(value: string | null | undefined) {
  return value?.toLowerCase() ?? null;
}

function serializeCompanyScope(
  value:
    | {
        companyId: string;
        company?: CompanyProfile | null;
      }
    | null
    | undefined,
) {
  return {
    companyId: value?.companyId ?? null,
    companySlug: value?.company?.slug ?? null,
  };
}

export function serializeCompanyProfile(
  company: CompanyProfile & {
    gmailAccounts?: Array<GmailAccount & { token?: GmailToken | null; watches?: GmailWatch[] }>;
    whatsAppChannel?: WhatsAppChannel | null;
  },
) {
  const gmailAccounts = (company.gmailAccounts ?? []).map(serializeGmailAccount);

  return {
    id: company.id,
    slug: company.slug,
    name: company.name,
    isDefault: company.isDefault,
    isActive: company.isActive,
    notes: company.notes,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    gmailAccounts,
    gmailAccount: gmailAccounts[0] ?? null,
    whatsAppChannel: company.whatsAppChannel ? serializeWhatsAppChannel(company.whatsAppChannel) : null,
  };
}

export function serializeAllowedBankSender(
  sender: AllowedBankSender & {
    company?: CompanyProfile | null;
  },
) {
  return {
    ...sender,
    ...serializeCompanyScope(sender),
  };
}

export function serializeIntegrationApiToken(
  token: IntegrationApiToken & {
    company?: CompanyProfile | null;
  },
) {
  const now = new Date();

  return {
    ...serializeCompanyScope(token),
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    scopes: token.scopes,
    lastUsedAt: token.lastUsedAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    createdByUserId: token.createdByUserId,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
    isActive: token.revokedAt === null && (!token.expiresAt || token.expiresAt > now),
  };
}

export function serializeParsedNotification(notification: ParsedBankNotification | null) {
  if (!notification) {
    return null;
  }

  return {
    ...notification,
    amount: decimalToNumber(notification.amount),
    currency: notification.currency,
  };
}

export function serializeInboundEmail(
  email: InboundEmail & {
    parsedNotification?: ParsedBankNotification | null;
    matches?: TransferMatch[];
    company?: CompanyProfile | null;
    gmailAccount?: GmailAccount | null;
  },
) {
  return {
    ...serializeCompanyScope(email),
    id: email.id,
    gmailAccountId: email.gmailAccountId,
    gmailAccountEmail: email.gmailAccount?.email ?? null,
    gmailMessageId: email.gmailMessageId,
    gmailThreadId: email.gmailThreadId,
    historyId: email.historyId,
    subject: email.subject,
    fromAddress: email.fromAddress,
    toAddress: email.toAddress,
    replyToAddress: email.replyToAddress,
    returnPathAddress: email.returnPathAddress,
    messageIdHeader: email.messageIdHeader,
    snippet: email.snippet,
    bodyText: email.bodyText,
    bodyHtml: email.bodyHtml,
    authenticityStatus: enumToClientValue(email.authenticityStatus),
    authScore: email.authScore,
    authenticityFlags: email.authenticityFlags,
    senderMatchType: enumToClientValue(email.senderMatchType),
    processingStatus: enumToClientValue(email.processingStatus),
    internalDate: email.internalDate,
    receivedAt: email.receivedAt,
    parsedAt: email.parsedAt,
    matchedAt: email.matchedAt,
    createdAt: email.createdAt,
    updatedAt: email.updatedAt,
    parsedNotification: serializeParsedNotification(email.parsedNotification ?? null),
    matchCount: email.matches?.length ?? 0,
  };
}

export function serializeExpectedTransfer(
  transfer: ExpectedTransfer & {
    matches?: TransferMatch[];
    company?: CompanyProfile | null;
  },
) {
  return {
    ...serializeCompanyScope(transfer),
    id: transfer.id,
    referenceExpected: transfer.referenceExpected,
    amountExpected: decimalToNumber(transfer.amountExpected),
    currency: transfer.currency,
    expectedBank: transfer.expectedBank,
    expectedWindowFrom: transfer.expectedWindowFrom,
    expectedWindowTo: transfer.expectedWindowTo,
    destinationAccountLast4: transfer.destinationAccountLast4,
    customerName: transfer.customerName,
    notes: transfer.notes,
    status: enumToClientValue(transfer.status),
    matchSummary: transfer.matchSummary,
    confirmedAt: transfer.confirmedAt,
    rejectedAt: transfer.rejectedAt,
    deletedAt: transfer.deletedAt,
    createdAt: transfer.createdAt,
    updatedAt: transfer.updatedAt,
    matchCount: transfer.matches?.length ?? 0,
  };
}

export function serializeTransferMatch(
  match: TransferMatch & {
    inboundEmail?: InboundEmail | null;
    expectedTransfer?: ExpectedTransfer | null;
    parsedNotification?: ParsedBankNotification | null;
    company?: CompanyProfile | null;
  },
) {
  return {
    ...serializeCompanyScope(match),
    id: match.id,
    inboundEmailId: match.inboundEmailId,
    expectedTransferId: match.expectedTransferId,
    parsedNotificationId: match.parsedNotificationId,
    score: match.score,
    status: enumToClientValue(match.status),
    reasons: match.reasons,
    criticalFlags: match.criticalFlags,
    preconfirmedAt: match.preconfirmedAt,
    reviewedAt: match.reviewedAt,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    inboundEmail: match.inboundEmail ? serializeInboundEmail(match.inboundEmail) : null,
    expectedTransfer: match.expectedTransfer ? serializeExpectedTransfer(match.expectedTransfer) : null,
    parsedNotification: serializeParsedNotification(match.parsedNotification ?? null),
  };
}

export function serializeManualReview(
  review: ManualReview & {
    inboundEmail?: InboundEmail | null;
    expectedTransfer?: ExpectedTransfer | null;
    transferMatch?: TransferMatch | null;
    company?: CompanyProfile | null;
  },
) {
  return {
    ...review,
    ...serializeCompanyScope(review),
    status: enumToClientValue(review.status),
    inboundEmail: review.inboundEmail ? serializeInboundEmail(review.inboundEmail) : null,
    expectedTransfer: review.expectedTransfer
      ? serializeExpectedTransfer(review.expectedTransfer)
      : null,
    transferMatch: review.transferMatch ? serializeTransferMatch(review.transferMatch) : null,
  };
}

export function serializeAuditLog(
  log: AuditLog & {
    company?: CompanyProfile | null;
  },
) {
  return {
    ...log,
    ...serializeCompanyScope(log),
    actorType: enumToClientValue(log.actorType),
  };
}

export function serializeGmailAccount(
  account: GmailAccount & {
    token?: GmailToken | null;
    watches?: GmailWatch[];
    company?: CompanyProfile | null;
  },
) {
  return {
    ...serializeCompanyScope(account),
    id: account.id,
    email: account.email,
    googleAccountId: account.googleAccountId,
    displayName: account.displayName,
    isActive: account.isActive,
    profileSnapshot: account.profileSnapshot,
    connectedAt: account.connectedAt,
    lastSyncedAt: account.lastSyncedAt,
    hasToken: Boolean(account.token),
    watch: account.watches?.[0]
      ? {
          id: account.watches[0].id,
          historyId: account.watches[0].historyId,
          topicName: account.watches[0].topicName,
          subscriptionName: account.watches[0].subscriptionName,
          status: enumToClientValue(account.watches[0].status),
          expirationAt: account.watches[0].expirationAt,
          lastPulledAt: account.watches[0].lastPulledAt,
          lastError: account.watches[0].lastError,
        }
      : null,
  };
}

export function serializeWhatsAppChannel(
  channel: WhatsAppChannel & { company?: CompanyProfile | null },
) {
  return {
    ...channel,
    ...serializeCompanyScope(channel),
  };
}

export function serializeWhatsAppConversation(
  conversation: WhatsAppConversation & { company?: CompanyProfile | null },
) {
  return {
    ...conversation,
    ...serializeCompanyScope(conversation),
    status: enumToClientValue(conversation.status),
  };
}

export function serializeWhatsAppInboundMessage(
  message: WhatsAppInboundMessage & { company?: CompanyProfile | null },
) {
  return {
    ...message,
    ...serializeCompanyScope(message),
  };
}

export function serializeWhatsAppVerificationAttempt(
  attempt: WhatsAppVerificationAttempt & {
    inboundMessage?: WhatsAppInboundMessage | null;
    conversation?: WhatsAppConversation | null;
    company?: CompanyProfile | null;
  },
) {
  return {
    ...attempt,
    ...serializeCompanyScope(attempt),
    status: enumToClientValue(attempt.status),
    inboundMessage: attempt.inboundMessage ? serializeWhatsAppInboundMessage(attempt.inboundMessage) : null,
    conversation: attempt.conversation ? serializeWhatsAppConversation(attempt.conversation) : null,
  };
}
