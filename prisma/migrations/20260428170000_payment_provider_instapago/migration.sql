-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('INSTAPAGO');

-- CreateEnum
CREATE TYPE "PaymentProviderMethod" AS ENUM ('PAGO_MOVIL', 'TRANSFERENCIA_DIRECTA');

-- CreateTable
CREATE TABLE "CompanyPaymentProviderConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "apiBaseUrl" TEXT NOT NULL,
    "keyIdEncrypted" TEXT NOT NULL,
    "publicKeyIdEncrypted" TEXT NOT NULL,
    "defaultReceiptBank" TEXT NOT NULL,
    "defaultOriginBank" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPaymentProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderVerificationAttempt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "method" "PaymentProviderMethod" NOT NULL,
    "externalRequestId" TEXT,
    "referenceExpected" TEXT NOT NULL,
    "amountExpected" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "operationDate" TIMESTAMP(3) NOT NULL,
    "requestPayload" JSONB,
    "providerRequest" JSONB,
    "providerResponse" JSONB,
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "reasonCode" TEXT NOT NULL,
    "providerCode" TEXT,
    "providerMessage" TEXT,
    "matchedReference" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderVerificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyPaymentProviderConfig_companyId_provider_key" ON "CompanyPaymentProviderConfig"("companyId", "provider");

-- CreateIndex
CREATE INDEX "CompanyPaymentProviderConfig_companyId_isActive_idx" ON "CompanyPaymentProviderConfig"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderVerificationAttempt_companyId_provider_method_externalRequestId_key" ON "PaymentProviderVerificationAttempt"("companyId", "provider", "method", "externalRequestId");

-- CreateIndex
CREATE INDEX "payment_provider_attempt_company_method_created_idx" ON "PaymentProviderVerificationAttempt"("companyId", "provider", "method", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_provider_attempt_company_method_ref_idx" ON "PaymentProviderVerificationAttempt"("companyId", "provider", "method", "referenceExpected");

-- AddForeignKey
ALTER TABLE "CompanyPaymentProviderConfig" ADD CONSTRAINT "CompanyPaymentProviderConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderVerificationAttempt" ADD CONSTRAINT "PaymentProviderVerificationAttempt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
