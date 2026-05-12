import prismaClient from '@prisma/client';

export const {
  ActorType,
  AuthStatus,
  GmailWatchStatus,
  InboundEmailStatus,
  InstapagoTransportMode,
  ManualReviewStatus,
  MatchStatus,
  PaymentProvider,
  PaymentProviderMethod,
  PaymentConsumptionStatus,
  PaymentValidationChannel,
  PaymentValidationMethod,
  PaymentValidationRecordStatus,
  PrismaClient,
  SenderMatchType,
  TransferEvidenceStatus,
  WhatsAppConversationStatus,
  WhatsAppVerificationAttemptStatus,
} = prismaClient;
