-- CreateTable
CREATE TABLE "IntegrationApiToken" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationApiToken_tokenPrefix_key" ON "IntegrationApiToken"("tokenPrefix");

-- CreateIndex
CREATE INDEX "IntegrationApiToken_companyId_createdAt_idx" ON "IntegrationApiToken"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "IntegrationApiToken_companyId_revokedAt_expiresAt_idx" ON "IntegrationApiToken"("companyId", "revokedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "IntegrationApiToken" ADD CONSTRAINT "IntegrationApiToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
