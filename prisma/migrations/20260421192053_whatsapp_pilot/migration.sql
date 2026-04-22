-- CreateEnum
CREATE TYPE "WhatsAppConversationStatus" AS ENUM ('IDLE', 'AWAITING_DETAILS', 'BLOCKED');

-- CreateEnum
CREATE TYPE "WhatsAppVerificationAttemptStatus" AS ENUM ('INCOMPLETE', 'AUTHORIZED', 'BLOCKED', 'REJECTED_UNAUTHORIZED', 'UNSUPPORTED');

-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "status" "WhatsAppConversationStatus" NOT NULL DEFAULT 'IDLE',
    "partialPayload" JSONB,
    "pendingFields" JSONB,
    "lastInboundMessageId" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppInboundMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "twilioMessageSid" TEXT,
    "fromPhoneNumber" TEXT NOT NULL,
    "toPhoneNumber" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "bodyText" TEXT,
    "numMedia" INTEGER NOT NULL DEFAULT 0,
    "media" JSONB,
    "rawPayload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppInboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppVerificationAttempt" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "inboundMessageId" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "status" "WhatsAppVerificationAttemptStatus" NOT NULL,
    "sourceSummary" JSONB,
    "mergedInput" JSONB,
    "missingFields" JSONB,
    "dateStrategies" JSONB,
    "finalResult" JSONB,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppVerificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversation_phoneNumber_key" ON "WhatsAppConversation"("phoneNumber");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_status_updatedAt_idx" ON "WhatsAppConversation"("status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppInboundMessage_twilioMessageSid_key" ON "WhatsAppInboundMessage"("twilioMessageSid");

-- CreateIndex
CREATE INDEX "WhatsAppInboundMessage_fromPhoneNumber_receivedAt_idx" ON "WhatsAppInboundMessage"("fromPhoneNumber", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "WhatsAppVerificationAttempt_phoneNumber_createdAt_idx" ON "WhatsAppVerificationAttempt"("phoneNumber", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WhatsAppVerificationAttempt_status_createdAt_idx" ON "WhatsAppVerificationAttempt"("status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "WhatsAppInboundMessage" ADD CONSTRAINT "WhatsAppInboundMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppVerificationAttempt" ADD CONSTRAINT "WhatsAppVerificationAttempt_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppVerificationAttempt" ADD CONSTRAINT "WhatsAppVerificationAttempt_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "WhatsAppInboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
