-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('VES', 'USD', 'EUR', 'COP');

-- CreateEnum
CREATE TYPE "TransferEvidenceStatus" AS ENUM (
  'PENDING',
  'EMAIL_RECEIVED',
  'AUTHENTICITY_HIGH',
  'MATCH_FOUND',
  'PRECONFIRMED',
  'REQUIRES_REVIEW',
  'REJECTED',
  'CONFIRMED_MANUAL'
);

-- CreateEnum
CREATE TYPE "GmailWatchStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "InboundEmailStatus" AS ENUM ('RECEIVED', 'PARSED', 'MATCHED', 'NEEDS_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuthStatus" AS ENUM ('UNKNOWN', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM (
  'NO_MATCH',
  'POSSIBLE_MATCH',
  'STRONG_MATCH',
  'PRECONFIRMED',
  'NEEDS_REVIEW',
  'REJECTED'
);

-- CreateEnum
CREATE TYPE "ManualReviewStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('SYSTEM', 'USER', 'JOB');

CREATE TABLE "GmailAccount" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "googleAccountId" TEXT,
  "displayName" TEXT,
  "profileSnapshot" JSONB,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmailAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GmailToken" (
  "id" TEXT NOT NULL,
  "gmailAccountId" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "scope" TEXT NOT NULL,
  "tokenType" TEXT,
  "expiryDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmailToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GmailWatch" (
  "id" TEXT NOT NULL,
  "gmailAccountId" TEXT NOT NULL,
  "topicName" TEXT NOT NULL,
  "subscriptionName" TEXT NOT NULL,
  "historyId" TEXT NOT NULL,
  "expirationAt" TIMESTAMP(3) NOT NULL,
  "status" "GmailWatchStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastPulledAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmailWatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboundEmail" (
  "id" TEXT NOT NULL,
  "gmailAccountId" TEXT NOT NULL,
  "gmailMessageId" TEXT NOT NULL,
  "gmailThreadId" TEXT,
  "historyId" TEXT,
  "snippet" TEXT,
  "internalDate" TIMESTAMP(3),
  "subject" TEXT,
  "fromAddress" TEXT,
  "toAddress" TEXT,
  "replyToAddress" TEXT,
  "returnPathAddress" TEXT,
  "messageIdHeader" TEXT,
  "bodyText" TEXT,
  "bodyHtml" TEXT,
  "rawPayload" JSONB,
  "authenticityStatus" "AuthStatus" NOT NULL DEFAULT 'UNKNOWN',
  "authScore" INTEGER NOT NULL DEFAULT 0,
  "authenticityFlags" JSONB,
  "processingStatus" "InboundEmailStatus" NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "parsedAt" TIMESTAMP(3),
  "matchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailHeader" (
  "id" TEXT NOT NULL,
  "inboundEmailId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailHeader_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParsedBankNotification" (
  "id" TEXT NOT NULL,
  "inboundEmailId" TEXT NOT NULL,
  "parserName" TEXT NOT NULL,
  "bankName" TEXT,
  "reference" TEXT,
  "amount" DECIMAL(18,2),
  "currency" "Currency",
  "transferAt" TIMESTAMP(3),
  "sender" TEXT,
  "subject" TEXT,
  "destinationAccountLast4" TEXT,
  "originatorName" TEXT,
  "confidenceScore" INTEGER NOT NULL DEFAULT 0,
  "extractedData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParsedBankNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpectedTransfer" (
  "id" TEXT NOT NULL,
  "referenceExpected" TEXT NOT NULL,
  "amountExpected" DECIMAL(18,2) NOT NULL,
  "currency" "Currency" NOT NULL,
  "expectedBank" TEXT NOT NULL,
  "expectedWindowFrom" TIMESTAMP(3) NOT NULL,
  "expectedWindowTo" TIMESTAMP(3) NOT NULL,
  "destinationAccountLast4" TEXT,
  "customerName" TEXT,
  "notes" TEXT,
  "status" "TransferEvidenceStatus" NOT NULL DEFAULT 'PENDING',
  "matchSummary" JSONB,
  "confirmedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpectedTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransferMatch" (
  "id" TEXT NOT NULL,
  "inboundEmailId" TEXT NOT NULL,
  "expectedTransferId" TEXT NOT NULL,
  "parsedNotificationId" TEXT,
  "score" INTEGER NOT NULL,
  "status" "MatchStatus" NOT NULL,
  "reasons" JSONB NOT NULL,
  "criticalFlags" JSONB,
  "preconfirmedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransferMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualReview" (
  "id" TEXT NOT NULL,
  "transferMatchId" TEXT,
  "expectedTransferId" TEXT,
  "inboundEmailId" TEXT,
  "status" "ManualReviewStatus" NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'medium',
  "notes" TEXT,
  "resolutionNotes" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManualReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AllowedBankSender" (
  "id" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "senderEmail" TEXT,
  "senderDomain" TEXT,
  "replyToPattern" TEXT,
  "returnPathPattern" TEXT,
  "messageIdPattern" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllowedBankSender_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorType" "ActorType" NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GmailAccount_email_key" ON "GmailAccount"("email");
CREATE UNIQUE INDEX "GmailAccount_googleAccountId_key" ON "GmailAccount"("googleAccountId");
CREATE UNIQUE INDEX "GmailToken_gmailAccountId_key" ON "GmailToken"("gmailAccountId");
CREATE INDEX "GmailWatch_gmailAccountId_status_idx" ON "GmailWatch"("gmailAccountId", "status");
CREATE INDEX "GmailWatch_expirationAt_idx" ON "GmailWatch"("expirationAt");
CREATE UNIQUE INDEX "InboundEmail_gmailMessageId_key" ON "InboundEmail"("gmailMessageId");
CREATE INDEX "InboundEmail_gmailAccountId_receivedAt_idx" ON "InboundEmail"("gmailAccountId", "receivedAt" DESC);
CREATE INDEX "InboundEmail_processingStatus_receivedAt_idx" ON "InboundEmail"("processingStatus", "receivedAt" DESC);
CREATE INDEX "InboundEmail_authenticityStatus_authScore_idx" ON "InboundEmail"("authenticityStatus", "authScore");
CREATE INDEX "EmailHeader_inboundEmailId_name_idx" ON "EmailHeader"("inboundEmailId", "name");
CREATE UNIQUE INDEX "ParsedBankNotification_inboundEmailId_key" ON "ParsedBankNotification"("inboundEmailId");
CREATE INDEX "ParsedBankNotification_bankName_transferAt_idx" ON "ParsedBankNotification"("bankName", "transferAt");
CREATE INDEX "ParsedBankNotification_reference_idx" ON "ParsedBankNotification"("reference");
CREATE INDEX "ExpectedTransfer_status_expectedWindowFrom_idx" ON "ExpectedTransfer"("status", "expectedWindowFrom");
CREATE INDEX "ExpectedTransfer_referenceExpected_idx" ON "ExpectedTransfer"("referenceExpected");
CREATE INDEX "ExpectedTransfer_expectedBank_amountExpected_currency_idx" ON "ExpectedTransfer"("expectedBank", "amountExpected", "currency");
CREATE UNIQUE INDEX "TransferMatch_inboundEmailId_expectedTransferId_key" ON "TransferMatch"("inboundEmailId", "expectedTransferId");
CREATE INDEX "TransferMatch_status_score_idx" ON "TransferMatch"("status", "score");
CREATE INDEX "TransferMatch_expectedTransferId_createdAt_idx" ON "TransferMatch"("expectedTransferId", "createdAt" DESC);
CREATE INDEX "ManualReview_status_createdAt_idx" ON "ManualReview"("status", "createdAt" DESC);
CREATE INDEX "AllowedBankSender_bankName_isActive_idx" ON "AllowedBankSender"("bankName", "isActive");
CREATE INDEX "AllowedBankSender_senderEmail_idx" ON "AllowedBankSender"("senderEmail");
CREATE INDEX "AllowedBankSender_senderDomain_idx" ON "AllowedBankSender"("senderDomain");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);

ALTER TABLE "GmailToken"
  ADD CONSTRAINT "GmailToken_gmailAccountId_fkey"
  FOREIGN KEY ("gmailAccountId") REFERENCES "GmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GmailWatch"
  ADD CONSTRAINT "GmailWatch_gmailAccountId_fkey"
  FOREIGN KEY ("gmailAccountId") REFERENCES "GmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InboundEmail"
  ADD CONSTRAINT "InboundEmail_gmailAccountId_fkey"
  FOREIGN KEY ("gmailAccountId") REFERENCES "GmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailHeader"
  ADD CONSTRAINT "EmailHeader_inboundEmailId_fkey"
  FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ParsedBankNotification"
  ADD CONSTRAINT "ParsedBankNotification_inboundEmailId_fkey"
  FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransferMatch"
  ADD CONSTRAINT "TransferMatch_inboundEmailId_fkey"
  FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransferMatch"
  ADD CONSTRAINT "TransferMatch_expectedTransferId_fkey"
  FOREIGN KEY ("expectedTransferId") REFERENCES "ExpectedTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TransferMatch"
  ADD CONSTRAINT "TransferMatch_parsedNotificationId_fkey"
  FOREIGN KEY ("parsedNotificationId") REFERENCES "ParsedBankNotification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ManualReview"
  ADD CONSTRAINT "ManualReview_transferMatchId_fkey"
  FOREIGN KEY ("transferMatchId") REFERENCES "TransferMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ManualReview"
  ADD CONSTRAINT "ManualReview_expectedTransferId_fkey"
  FOREIGN KEY ("expectedTransferId") REFERENCES "ExpectedTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ManualReview"
  ADD CONSTRAINT "ManualReview_inboundEmailId_fkey"
  FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
