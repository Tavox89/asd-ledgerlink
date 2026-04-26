ALTER TABLE "GmailAccount"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "GmailAccount_companyId_isActive_connectedAt_idx"
ON "GmailAccount"("companyId", "isActive", "connectedAt" DESC);
