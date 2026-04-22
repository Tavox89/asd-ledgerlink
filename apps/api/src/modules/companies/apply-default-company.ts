import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { normalizeWhatsAppPhone, parseAllowedTestNumbers } from '../channels/whatsapp.helpers';
import { ensureDefaultCompany } from './companies.service';

const prisma = new PrismaClient();

async function main() {
  const company = await ensureDefaultCompany();

  if (env.TWILIO_WHATSAPP_FROM || env.TWILIO_SERVICE_SID) {
    await prisma.whatsAppChannel.upsert({
      where: {
        companyId: company.id,
      },
      create: {
        companyId: company.id,
        phoneNumber: normalizeWhatsAppPhone(env.TWILIO_WHATSAPP_FROM) || '+10000000000',
        messagingServiceSid: env.TWILIO_SERVICE_SID || undefined,
        allowedTestNumbers: parseAllowedTestNumbers(env.WHATSAPP_ALLOWED_TEST_NUMBERS),
        isActive: true,
      },
      update: {
        phoneNumber: normalizeWhatsAppPhone(env.TWILIO_WHATSAPP_FROM) || '+10000000000',
        messagingServiceSid: env.TWILIO_SERVICE_SID || undefined,
        allowedTestNumbers: parseAllowedTestNumbers(env.WHATSAPP_ALLOWED_TEST_NUMBERS),
      },
    });
  }

  logger.info({ companyId: company.id, slug: company.slug }, 'Default company backfill completed');
}

main()
  .catch((error) => {
    logger.error({ err: error }, 'Default company backfill failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
