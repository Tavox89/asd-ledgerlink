import 'dotenv/config';

import { env } from './config/env';
import {
  ManualReviewStatus,
  MatchStatus,
  PrismaClient,
  TransferEvidenceStatus,
} from './lib/prisma-runtime';
import { logger } from './lib/logger';
import { normalizeWhatsAppPhone, parseAllowedTestNumbers } from './modules/channels/whatsapp.helpers';
import { ingestNormalizedEmail } from './modules/email-processing/ingestion.service';
import {
  demoExpectedTransfers,
  sampleEmailFixtures,
} from './modules/email-processing/fixtures/sample-emails';

const prisma = new PrismaClient();

async function resetDatabase() {
  await prisma.whatsAppVerificationAttempt.deleteMany();
  await prisma.whatsAppInboundMessage.deleteMany();
  await prisma.whatsAppConversation.deleteMany();
  await prisma.whatsAppChannel.deleteMany();
  await prisma.manualReview.deleteMany();
  await prisma.transferMatch.deleteMany();
  await prisma.parsedBankNotification.deleteMany();
  await prisma.emailHeader.deleteMany();
  await prisma.inboundEmail.deleteMany();
  await prisma.gmailWatch.deleteMany();
  await prisma.gmailToken.deleteMany();
  await prisma.gmailAccount.deleteMany();
  await prisma.expectedTransfer.deleteMany();
  await prisma.allowedBankSender.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.companyProfile.deleteMany();
}

async function seed() {
  await resetDatabase();

  const company = await prisma.companyProfile.create({
    data: {
      slug: 'default',
      name: 'Default Workspace',
      isDefault: true,
      isActive: true,
      notes: 'Seeded default company profile',
    },
  });

  const gmailAccount = await prisma.gmailAccount.create({
    data: {
      companyId: company.id,
      email: env.GOOGLE_GMAIL_ACCOUNT || 'ledgerlink-demo@example.com',
      displayName: 'LedgerLink Demo Inbox',
    },
  });

  if (env.TWILIO_WHATSAPP_FROM || env.TWILIO_SERVICE_SID) {
    await prisma.whatsAppChannel.create({
      data: {
        companyId: company.id,
        phoneNumber: normalizeWhatsAppPhone(env.TWILIO_WHATSAPP_FROM) || '+10000000000',
        messagingServiceSid: env.TWILIO_SERVICE_SID || undefined,
        allowedTestNumbers: parseAllowedTestNumbers(env.WHATSAPP_ALLOWED_TEST_NUMBERS),
      },
    });
  }

  await prisma.allowedBankSender.createMany({
    data: [
      {
        companyId: company.id,
        bankName: 'Banesco',
        senderEmail: 'notificaciones@banesco.com',
        senderDomain: 'banesco.com',
        notes: 'Demo allowlist Banesco',
      },
      {
        companyId: company.id,
        bankName: 'Mercantil Banco',
        senderEmail: 'alerts@mercantilbanco.com',
        senderDomain: 'mercantilbanco.com',
        notes: 'Demo allowlist Mercantil',
      },
      {
        companyId: company.id,
        bankName: 'Banco de Venezuela',
        senderDomain: 'bancodevenezuela.com',
        notes: 'Demo domain rule',
      },
    ],
  });

  for (const transfer of demoExpectedTransfers) {
    await prisma.expectedTransfer.create({
      data: {
        companyId: company.id,
        referenceExpected: transfer.referenciaEsperada,
        amountExpected: transfer.montoEsperado,
        currency: transfer.moneda,
        expectedBank: transfer.bancoEsperado,
        expectedWindowFrom: new Date(transfer.fechaEsperadaDesde),
        expectedWindowTo: new Date(transfer.fechaEsperadaHasta),
        destinationAccountLast4: transfer.cuentaDestinoUltimos4 ?? undefined,
        customerName: transfer.nombreClienteOpcional ?? undefined,
        notes: transfer.notas ?? undefined,
        status: TransferEvidenceStatus.PENDING,
      },
    });
  }

  for (const fixture of sampleEmailFixtures) {
    await ingestNormalizedEmail(company.id, gmailAccount.id, fixture);
  }

  const firstReview = await prisma.manualReview.findFirst({
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!firstReview) {
    const fallbackMatch = await prisma.transferMatch.findFirst({
      where: {
        status: MatchStatus.NEEDS_REVIEW,
      },
    });

    if (fallbackMatch) {
      await prisma.manualReview.create({
        data: {
          companyId: company.id,
          transferMatchId: fallbackMatch.id,
          expectedTransferId: fallbackMatch.expectedTransferId,
          inboundEmailId: fallbackMatch.inboundEmailId,
          status: ManualReviewStatus.OPEN,
          notes: 'Seed fallback review entry',
        },
      });
    }
  }

  logger.info('Seed completed successfully');
}

seed()
  .catch((error) => {
    logger.error({ err: error }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
