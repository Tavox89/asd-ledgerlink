import type { EmailHeader, InboundEmail } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { AuthStatus, InboundEmailStatus, SenderMatchType } from '../../lib/prisma-runtime';
import { serializeInboundEmail } from '../../lib/serializers';
import { clearMatchesForInboundEmail, syncMatchesForInboundEmail } from '../matches/matching.service';
import { classifyAllowedSender, evaluateEmailAuthenticity } from './authenticity';
import { parseBankNotification } from './parsers';
import type { NormalizedInboundEmail } from './types';

const ALLOWED_SENDER_REPROCESS_BATCH_SIZE = 25;

function mapAuthStatus(status: 'unknown' | 'low' | 'medium' | 'high') {
  switch (status) {
    case 'high':
      return AuthStatus.HIGH;
    case 'medium':
      return AuthStatus.MEDIUM;
    case 'low':
      return AuthStatus.LOW;
    default:
      return AuthStatus.UNKNOWN;
  }
}

function mapSenderMatchType(senderMatchType: 'none' | 'email' | 'domain') {
  switch (senderMatchType) {
    case 'email':
      return SenderMatchType.EMAIL;
    case 'domain':
      return SenderMatchType.DOMAIN;
    default:
      return SenderMatchType.NONE;
  }
}

function buildHeaderMap(headers: Array<Pick<EmailHeader, 'name' | 'value'>>) {
  return headers.reduce<Record<string, string[]>>((accumulator, header) => {
    const key = header.name.toLowerCase();
    accumulator[key] = [...(accumulator[key] ?? []), header.value];
    return accumulator;
  }, {});
}

function normalizeStoredInboundEmail(
  email: InboundEmail & {
    headers: Array<Pick<EmailHeader, 'name' | 'value'>>;
  },
): NormalizedInboundEmail {
  return {
    gmailMessageId: email.gmailMessageId,
    gmailThreadId: email.gmailThreadId,
    historyId: email.historyId,
    snippet: email.snippet,
    internalDate: email.internalDate,
    subject: email.subject,
    fromAddress: email.fromAddress,
    toAddress: email.toAddress,
    replyToAddress: email.replyToAddress,
    returnPathAddress: email.returnPathAddress,
    messageIdHeader: email.messageIdHeader,
    bodyText: email.bodyText,
    bodyHtml: email.bodyHtml,
    headers: email.headers.map((header) => ({
      name: header.name,
      value: header.value,
    })),
    headerMap: buildHeaderMap(email.headers),
  };
}

function buildAllowedSenderReprocessFilters(sender: {
  senderEmail?: string | null;
  senderDomain?: string | null;
}) {
  const filters = [];
  const normalizedEmail = sender.senderEmail?.trim().toLowerCase();
  const normalizedDomain = sender.senderDomain?.trim().toLowerCase();

  if (normalizedEmail) {
    filters.push({
      fromAddress: normalizedEmail,
    });
  }

  if (normalizedDomain) {
    filters.push({
      fromAddress: {
        endsWith: `@${normalizedDomain}`,
      },
    });
    filters.push({
      fromAddress: {
        endsWith: `.${normalizedDomain}`,
      },
    });
  }

  return filters;
}

export async function ingestNormalizedEmail(
  companyId: string,
  gmailAccountId: string,
  email: NormalizedInboundEmail,
) {
  const allowedSenders = await prisma.allowedBankSender.findMany({
    where: {
      companyId,
      isActive: true,
    },
  });

  const senderClassification = classifyAllowedSender(email, allowedSenders);
  const authEvaluation = evaluateEmailAuthenticity(email, allowedSenders);
  const dbSenderMatchType = mapSenderMatchType(senderClassification.senderMatchType);

  const storedEmail = await prisma.$transaction(async (tx) => {
    const upsertedEmail = await tx.inboundEmail.upsert({
      where: {
        gmailMessageId: email.gmailMessageId,
      },
      create: {
        companyId,
        gmailAccountId,
        gmailMessageId: email.gmailMessageId,
        gmailThreadId: email.gmailThreadId,
        historyId: email.historyId,
        snippet: email.snippet,
        internalDate: email.internalDate,
        subject: email.subject,
        fromAddress: email.fromAddress,
        toAddress: email.toAddress,
        replyToAddress: email.replyToAddress,
        returnPathAddress: email.returnPathAddress,
        messageIdHeader: email.messageIdHeader,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        rawPayload: {
          headerCount: email.headers.length,
        },
        authenticityStatus: mapAuthStatus(authEvaluation.authStatus),
        authScore: authEvaluation.authScore,
        authenticityFlags: {
          riskFlags: authEvaluation.riskFlags,
          flags: authEvaluation.flags,
        },
        senderMatchType: dbSenderMatchType,
        processingStatus: InboundEmailStatus.RECEIVED,
      },
      update: {
        companyId,
        gmailThreadId: email.gmailThreadId,
        historyId: email.historyId,
        snippet: email.snippet,
        internalDate: email.internalDate,
        subject: email.subject,
        fromAddress: email.fromAddress,
        toAddress: email.toAddress,
        replyToAddress: email.replyToAddress,
        returnPathAddress: email.returnPathAddress,
        messageIdHeader: email.messageIdHeader,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        authenticityStatus: mapAuthStatus(authEvaluation.authStatus),
        authScore: authEvaluation.authScore,
        authenticityFlags: {
          riskFlags: authEvaluation.riskFlags,
          flags: authEvaluation.flags,
        },
        senderMatchType: dbSenderMatchType,
        processingStatus: dbSenderMatchType === SenderMatchType.NONE ? InboundEmailStatus.IGNORED : InboundEmailStatus.RECEIVED,
      },
    });

    await tx.emailHeader.deleteMany({
      where: {
        inboundEmailId: upsertedEmail.id,
      },
    });

    await tx.emailHeader.createMany({
      data: email.headers.map((header, index) => ({
        inboundEmailId: upsertedEmail.id,
        name: header.name,
        value: header.value,
        position: index,
      })),
    });

    return upsertedEmail;
  });

  if (dbSenderMatchType === SenderMatchType.NONE) {
    await clearMatchesForInboundEmail(companyId, storedEmail.id);
    await prisma.parsedBankNotification.deleteMany({
      where: {
        inboundEmailId: storedEmail.id,
      },
    });

    const ignoredEmail = await prisma.inboundEmail.update({
      where: {
        id: storedEmail.id,
      },
      data: {
        parsedAt: null,
        matchedAt: null,
        processingStatus: InboundEmailStatus.IGNORED,
      },
      include: {
        company: true,
        parsedNotification: true,
        matches: true,
      },
    });

    return serializeInboundEmail(ignoredEmail);
  }

  const parsedNotification = parseBankNotification(email);

  const inboundEmail = await prisma.$transaction(async (tx) => {
    await tx.parsedBankNotification.upsert({
      where: {
        inboundEmailId: storedEmail.id,
      },
      create: {
        companyId,
        inboundEmailId: storedEmail.id,
        parserName: parsedNotification?.parserName ?? 'generic-bank-parser',
        bankName: parsedNotification?.bankName,
        reference: parsedNotification?.reference,
        amount: parsedNotification?.amount ?? undefined,
        currency: parsedNotification?.currency?.toUpperCase() as 'VES' | 'USD' | 'EUR' | 'COP' | undefined,
        transferAt: parsedNotification?.transferAt,
        sender: parsedNotification?.sender,
        subject: parsedNotification?.subject,
        destinationAccountLast4: parsedNotification?.destinationAccountLast4,
        originatorName: parsedNotification?.originatorName,
        confidenceScore: parsedNotification?.confidenceScore ?? 0,
        extractedData: parsedNotification?.extractedData as never,
      },
      update: {
        companyId,
        parserName: parsedNotification?.parserName ?? 'generic-bank-parser',
        bankName: parsedNotification?.bankName,
        reference: parsedNotification?.reference,
        amount: parsedNotification?.amount ?? undefined,
        currency: parsedNotification?.currency?.toUpperCase() as 'VES' | 'USD' | 'EUR' | 'COP' | undefined,
        transferAt: parsedNotification?.transferAt,
        sender: parsedNotification?.sender,
        subject: parsedNotification?.subject,
        destinationAccountLast4: parsedNotification?.destinationAccountLast4,
        originatorName: parsedNotification?.originatorName,
        confidenceScore: parsedNotification?.confidenceScore ?? 0,
        extractedData: parsedNotification?.extractedData as never,
      },
    });

    return tx.inboundEmail.update({
      where: {
        id: storedEmail.id,
      },
      data: {
        parsedAt: new Date(),
        processingStatus: InboundEmailStatus.PARSED,
      },
      include: {
        company: true,
        parsedNotification: true,
        matches: true,
      },
    });
  });

  await syncMatchesForInboundEmail(companyId, inboundEmail.id);

  const refreshed = await prisma.inboundEmail.findUnique({
    where: { id: inboundEmail.id },
    include: {
      company: true,
      parsedNotification: true,
      matches: true,
    },
  });

  return refreshed ? serializeInboundEmail(refreshed) : serializeInboundEmail(inboundEmail);
}

export async function reprocessStoredEmailsMatchingAllowedSender(
  sender: {
    companyId: string;
    senderEmail?: string | null;
    senderDomain?: string | null;
  },
) {
  const filters = buildAllowedSenderReprocessFilters(sender);
  if (filters.length === 0) {
    return {
      scanned: 0,
      reprocessed: 0,
    };
  }

  const emails = await prisma.inboundEmail.findMany({
    where: {
      companyId: sender.companyId,
      senderMatchType: SenderMatchType.NONE,
      OR: filters,
    },
    include: {
      headers: {
        orderBy: {
          position: 'asc',
        },
      },
    },
    orderBy: {
      receivedAt: 'desc',
    },
    take: ALLOWED_SENDER_REPROCESS_BATCH_SIZE,
  });

  for (const email of emails) {
    await ingestNormalizedEmail(email.companyId, email.gmailAccountId, normalizeStoredInboundEmail(email));
  }

  return {
    scanned: emails.length,
    reprocessed: emails.length,
  };
}
