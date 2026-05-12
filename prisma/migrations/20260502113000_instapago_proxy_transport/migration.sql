-- Add transport selection for InstaPago/Multibanco provider configs.
CREATE TYPE "InstapagoTransportMode" AS ENUM ('PROXY', 'DIRECT');

ALTER TABLE "CompanyPaymentProviderConfig"
  ADD COLUMN "transportMode" "InstapagoTransportMode" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "proxyBaseUrl" TEXT,
  ADD COLUMN "proxyTokenEncrypted" TEXT,
  ALTER COLUMN "keyIdEncrypted" DROP NOT NULL,
  ALTER COLUMN "publicKeyIdEncrypted" DROP NOT NULL;

-- Existing provider configs were created for direct InstaPago access. New configs
-- default to the proxy transport used for certification and production isolation.
ALTER TABLE "CompanyPaymentProviderConfig"
  ALTER COLUMN "transportMode" SET DEFAULT 'PROXY';
