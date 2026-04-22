CREATE TYPE "SenderMatchType" AS ENUM ('NONE', 'EMAIL', 'DOMAIN');

ALTER TYPE "InboundEmailStatus" ADD VALUE 'IGNORED';

ALTER TABLE "InboundEmail"
ADD COLUMN "senderMatchType" "SenderMatchType" NOT NULL DEFAULT 'NONE';
