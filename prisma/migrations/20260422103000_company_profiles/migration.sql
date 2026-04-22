-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppChannel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "messagingServiceSid" TEXT,
    "allowedTestNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppChannel_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "GmailAccount" ADD COLUMN "companyId" TEXT;
ALTER TABLE "InboundEmail" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ParsedBankNotification" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ExpectedTransfer" ADD COLUMN "companyId" TEXT;
ALTER TABLE "TransferMatch" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ManualReview" ADD COLUMN "companyId" TEXT;
ALTER TABLE "AllowedBankSender" ADD COLUMN "companyId" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "companyId" TEXT;
ALTER TABLE "WhatsAppInboundMessage" ADD COLUMN "companyId" TEXT;
ALTER TABLE "WhatsAppVerificationAttempt" ADD COLUMN "companyId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "companyId" TEXT;

-- Seed default company for backfill
INSERT INTO "CompanyProfile" ("id", "slug", "name", "isDefault", "isActive", "notes", "createdAt", "updatedAt")
SELECT
    'company_default',
    'default',
    'Default Workspace',
    true,
    true,
    'Backfilled from the original single-company LedgerLink workspace.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1
    FROM "CompanyProfile"
    WHERE "slug" = 'default'
);

-- Backfill company ownership
UPDATE "GmailAccount"
SET "companyId" = COALESCE("companyId", 'company_default');

UPDATE "InboundEmail"
SET "companyId" = COALESCE("InboundEmail"."companyId", "GmailAccount"."companyId")
FROM "GmailAccount"
WHERE "InboundEmail"."gmailAccountId" = "GmailAccount"."id";

UPDATE "ParsedBankNotification"
SET "companyId" = COALESCE("ParsedBankNotification"."companyId", "InboundEmail"."companyId")
FROM "InboundEmail"
WHERE "ParsedBankNotification"."inboundEmailId" = "InboundEmail"."id";

UPDATE "ExpectedTransfer"
SET "companyId" = COALESCE("companyId", 'company_default');

UPDATE "TransferMatch"
SET "companyId" = COALESCE(
    "TransferMatch"."companyId",
    "ExpectedTransfer"."companyId",
    "InboundEmail"."companyId"
)
FROM "ExpectedTransfer", "InboundEmail"
WHERE "TransferMatch"."expectedTransferId" = "ExpectedTransfer"."id"
  AND "TransferMatch"."inboundEmailId" = "InboundEmail"."id";

UPDATE "ManualReview"
SET "companyId" = "TransferMatch"."companyId"
FROM "TransferMatch"
WHERE "ManualReview"."companyId" IS NULL
  AND "ManualReview"."transferMatchId" = "TransferMatch"."id";

UPDATE "ManualReview"
SET "companyId" = "ExpectedTransfer"."companyId"
FROM "ExpectedTransfer"
WHERE "ManualReview"."companyId" IS NULL
  AND "ManualReview"."expectedTransferId" = "ExpectedTransfer"."id";

UPDATE "ManualReview"
SET "companyId" = "InboundEmail"."companyId"
FROM "InboundEmail"
WHERE "ManualReview"."companyId" IS NULL
  AND "ManualReview"."inboundEmailId" = "InboundEmail"."id";

UPDATE "ManualReview"
SET "companyId" = 'company_default'
WHERE "companyId" IS NULL;

UPDATE "AllowedBankSender"
SET "companyId" = COALESCE("companyId", 'company_default');

UPDATE "WhatsAppConversation"
SET "companyId" = COALESCE("companyId", 'company_default');

UPDATE "WhatsAppInboundMessage"
SET "companyId" = "WhatsAppConversation"."companyId"
FROM "WhatsAppConversation"
WHERE "WhatsAppInboundMessage"."companyId" IS NULL
  AND "WhatsAppInboundMessage"."conversationId" = "WhatsAppConversation"."id";

UPDATE "WhatsAppInboundMessage"
SET "companyId" = 'company_default'
WHERE "companyId" IS NULL;

UPDATE "WhatsAppVerificationAttempt"
SET "companyId" = "WhatsAppConversation"."companyId"
FROM "WhatsAppConversation"
WHERE "WhatsAppVerificationAttempt"."companyId" IS NULL
  AND "WhatsAppVerificationAttempt"."conversationId" = "WhatsAppConversation"."id";

UPDATE "WhatsAppVerificationAttempt"
SET "companyId" = "WhatsAppInboundMessage"."companyId"
FROM "WhatsAppInboundMessage"
WHERE "WhatsAppVerificationAttempt"."companyId" IS NULL
  AND "WhatsAppVerificationAttempt"."inboundMessageId" = "WhatsAppInboundMessage"."id";

UPDATE "WhatsAppVerificationAttempt"
SET "companyId" = 'company_default'
WHERE "companyId" IS NULL;

UPDATE "AuditLog"
SET "companyId" = COALESCE("companyId", 'company_default');

-- Enforce not null after backfill
ALTER TABLE "GmailAccount" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "InboundEmail" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ParsedBankNotification" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ExpectedTransfer" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "TransferMatch" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ManualReview" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "AllowedBankSender" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "WhatsAppConversation" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "WhatsAppInboundMessage" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "WhatsAppVerificationAttempt" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "companyId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_slug_key" ON "CompanyProfile"("slug");
CREATE INDEX "CompanyProfile_isActive_name_idx" ON "CompanyProfile"("isActive", "name");

CREATE UNIQUE INDEX "WhatsAppChannel_companyId_key" ON "WhatsAppChannel"("companyId");
CREATE UNIQUE INDEX "WhatsAppChannel_phoneNumber_key" ON "WhatsAppChannel"("phoneNumber");
CREATE UNIQUE INDEX "WhatsAppChannel_messagingServiceSid_key" ON "WhatsAppChannel"("messagingServiceSid");
CREATE INDEX "WhatsAppChannel_isActive_phoneNumber_idx" ON "WhatsAppChannel"("isActive", "phoneNumber");

CREATE UNIQUE INDEX "GmailAccount_companyId_key" ON "GmailAccount"("companyId");
CREATE INDEX "InboundEmail_companyId_receivedAt_idx" ON "InboundEmail"("companyId", "receivedAt" DESC);
CREATE INDEX "InboundEmail_companyId_processingStatus_receivedAt_idx" ON "InboundEmail"("companyId", "processingStatus", "receivedAt" DESC);
CREATE INDEX "InboundEmail_companyId_authenticityStatus_authScore_idx" ON "InboundEmail"("companyId", "authenticityStatus", "authScore");
CREATE INDEX "ParsedBankNotification_companyId_bankName_transferAt_idx" ON "ParsedBankNotification"("companyId", "bankName", "transferAt");
CREATE INDEX "ParsedBankNotification_companyId_reference_idx" ON "ParsedBankNotification"("companyId", "reference");
CREATE INDEX "ExpectedTransfer_companyId_status_expectedWindowFrom_idx" ON "ExpectedTransfer"("companyId", "status", "expectedWindowFrom");
CREATE INDEX "ExpectedTransfer_companyId_referenceExpected_idx" ON "ExpectedTransfer"("companyId", "referenceExpected");
CREATE INDEX "ExpectedTransfer_companyId_expectedBank_amountExpected_currency_idx" ON "ExpectedTransfer"("companyId", "expectedBank", "amountExpected", "currency");
CREATE INDEX "TransferMatch_companyId_status_score_idx" ON "TransferMatch"("companyId", "status", "score");
CREATE INDEX "TransferMatch_companyId_expectedTransferId_createdAt_idx" ON "TransferMatch"("companyId", "expectedTransferId", "createdAt" DESC);
CREATE INDEX "ManualReview_companyId_status_createdAt_idx" ON "ManualReview"("companyId", "status", "createdAt" DESC);
CREATE INDEX "AllowedBankSender_companyId_bankName_isActive_idx" ON "AllowedBankSender"("companyId", "bankName", "isActive");
CREATE INDEX "AllowedBankSender_companyId_senderEmail_idx" ON "AllowedBankSender"("companyId", "senderEmail");
CREATE INDEX "AllowedBankSender_companyId_senderDomain_idx" ON "AllowedBankSender"("companyId", "senderDomain");

DROP INDEX "WhatsAppConversation_phoneNumber_key";
DROP INDEX "WhatsAppConversation_status_updatedAt_idx";
CREATE UNIQUE INDEX "WhatsAppConversation_companyId_phoneNumber_key" ON "WhatsAppConversation"("companyId", "phoneNumber");
CREATE INDEX "WhatsAppConversation_companyId_status_updatedAt_idx" ON "WhatsAppConversation"("companyId", "status", "updatedAt" DESC);

DROP INDEX "WhatsAppInboundMessage_fromPhoneNumber_receivedAt_idx";
CREATE INDEX "WhatsAppInboundMessage_companyId_fromPhoneNumber_receivedAt_idx" ON "WhatsAppInboundMessage"("companyId", "fromPhoneNumber", "receivedAt" DESC);

DROP INDEX "WhatsAppVerificationAttempt_phoneNumber_createdAt_idx";
DROP INDEX "WhatsAppVerificationAttempt_status_createdAt_idx";
CREATE INDEX "WhatsAppVerificationAttempt_companyId_phoneNumber_createdAt_idx" ON "WhatsAppVerificationAttempt"("companyId", "phoneNumber", "createdAt" DESC);
CREATE INDEX "WhatsAppVerificationAttempt_companyId_status_createdAt_idx" ON "WhatsAppVerificationAttempt"("companyId", "status", "createdAt" DESC);

CREATE INDEX "AuditLog_companyId_entityType_entityId_idx" ON "AuditLog"("companyId", "entityType", "entityId");
CREATE INDEX "AuditLog_companyId_action_createdAt_idx" ON "AuditLog"("companyId", "action", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "WhatsAppChannel" ADD CONSTRAINT "WhatsAppChannel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GmailAccount" ADD CONSTRAINT "GmailAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParsedBankNotification" ADD CONSTRAINT "ParsedBankNotification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpectedTransfer" ADD CONSTRAINT "ExpectedTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransferMatch" ADD CONSTRAINT "TransferMatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManualReview" ADD CONSTRAINT "ManualReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AllowedBankSender" ADD CONSTRAINT "AllowedBankSender_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppInboundMessage" ADD CONSTRAINT "WhatsAppInboundMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppVerificationAttempt" ADD CONSTRAINT "WhatsAppVerificationAttempt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
