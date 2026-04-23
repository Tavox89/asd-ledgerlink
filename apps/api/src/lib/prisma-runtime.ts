import prismaClient from '@prisma/client';

export const {
  ActorType,
  AuthStatus,
  GmailWatchStatus,
  InboundEmailStatus,
  ManualReviewStatus,
  MatchStatus,
  PrismaClient,
  SenderMatchType,
  TransferEvidenceStatus,
  WhatsAppConversationStatus,
  WhatsAppVerificationAttemptStatus,
} = prismaClient;
