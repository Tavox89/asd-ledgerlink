import prismaClient from '@prisma/client';

export const {
  ActorType,
  AuthStatus,
  GmailWatchStatus,
  InboundEmailStatus,
  ManualReviewStatus,
  MatchStatus,
  PaymentProvider,
  PaymentProviderMethod,
  PrismaClient,
  SenderMatchType,
  TransferEvidenceStatus,
  WhatsAppConversationStatus,
  WhatsAppVerificationAttemptStatus,
} = prismaClient;
