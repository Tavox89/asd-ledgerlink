DROP INDEX "GmailAccount_companyId_key";

CREATE INDEX "GmailAccount_companyId_connectedAt_idx" ON "GmailAccount"("companyId", "connectedAt" DESC);
CREATE INDEX "GmailAccount_companyId_email_idx" ON "GmailAccount"("companyId", "email");
