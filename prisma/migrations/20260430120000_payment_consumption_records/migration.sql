-- CreateEnum
CREATE TYPE "PaymentValidationMethod" AS ENUM ('ZELLE', 'BINANCE', 'PAGO_MOVIL', 'TRANSFERENCIA_DIRECTA');

-- CreateEnum
CREATE TYPE "PaymentValidationChannel" AS ENUM ('WHATSAPP', 'OPENPOS', 'API', 'OPERATOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PaymentValidationRecordStatus" AS ENUM ('AUTHORIZED', 'BLOCKED', 'DUPLICATE', 'ERROR');

-- CreateEnum
CREATE TYPE "PaymentConsumptionStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateTable
CREATE TABLE "PaymentValidationRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "method" "PaymentValidationMethod" NOT NULL,
    "channel" "PaymentValidationChannel" NOT NULL,
    "status" "PaymentValidationRecordStatus" NOT NULL,
    "paymentFingerprint" TEXT,
    "externalRequestId" TEXT,
    "orderNumber" TEXT,
    "cashierId" TEXT,
    "cashierName" TEXT,
    "terminalId" TEXT,
    "store" TEXT,
    "validatorPhone" TEXT,
    "reference" TEXT,
    "amount" DECIMAL(18,2),
    "currency" "Currency",
    "operationDate" TIMESTAMP(3),
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "reasonCode" TEXT NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "evidence" JSONB,
    "consumptionId" TEXT,
    "duplicateOfConsumptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentValidationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentConsumption" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "method" "PaymentValidationMethod" NOT NULL,
    "paymentFingerprint" TEXT NOT NULL,
    "status" "PaymentConsumptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "reference" TEXT,
    "amount" DECIMAL(18,2),
    "currency" "Currency",
    "operationDate" TIMESTAMP(3),
    "channel" "PaymentValidationChannel" NOT NULL,
    "externalRequestId" TEXT,
    "orderNumber" TEXT,
    "cashierId" TEXT,
    "cashierName" TEXT,
    "terminalId" TEXT,
    "store" TEXT,
    "validatorPhone" TEXT,
    "validationRecordId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "releasedBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_validation_record_company_method_created_idx" ON "PaymentValidationRecord"("companyId", "method", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_validation_record_company_channel_created_idx" ON "PaymentValidationRecord"("companyId", "channel", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_validation_record_company_fingerprint_idx" ON "PaymentValidationRecord"("companyId", "paymentFingerprint");

-- CreateIndex
CREATE INDEX "payment_validation_record_company_external_idx" ON "PaymentValidationRecord"("companyId", "externalRequestId");

-- CreateIndex
CREATE INDEX "payment_consumption_company_method_created_idx" ON "PaymentConsumption"("companyId", "method", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_consumption_company_method_fingerprint_idx" ON "PaymentConsumption"("companyId", "method", "paymentFingerprint");

-- CreateIndex
CREATE INDEX "payment_consumption_company_status_created_idx" ON "PaymentConsumption"("companyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_consumption_company_order_idx" ON "PaymentConsumption"("companyId", "orderNumber");

-- Active consumptions are unique, but released consumptions stay as immutable history.
CREATE UNIQUE INDEX "payment_consumption_active_unique_idx" ON "PaymentConsumption"("companyId", "method", "paymentFingerprint") WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "PaymentValidationRecord" ADD CONSTRAINT "PaymentValidationRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentConsumption" ADD CONSTRAINT "PaymentConsumption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
