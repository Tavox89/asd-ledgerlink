import {
  type Prisma,
} from '@prisma/client';
import { paginationQuerySchema, type CreateManualVerificationInput } from '@ledgerlink/shared';

import { writeAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { ActorType, WhatsAppConversationStatus, WhatsAppVerificationAttemptStatus } from '../../lib/prisma-runtime';
import { serializeWhatsAppVerificationAttempt } from '../../lib/serializers';
import { DEFAULT_COMPANY_SLUG, getCompanyBySlugOrThrow } from '../companies/companies.service';
import { authorizeBinanceVerification, authorizeVerification } from '../verifications/verifications.service';
import {
  buildAuthorizedReply,
  buildBlockedReply,
  buildImageFallbackReply,
  buildMissingFieldsReply,
  buildTwimlResponse,
  buildUnknownMethodReply,
  buildUnauthorizedPhoneReply,
  buildUnsupportedMediaReply,
  buildVerificationNotes,
  buildVerificationStrategies,
  choosePreferredStrategyResult,
  detectVerificationMethod,
  extractVerificationFromText,
  findFirstImageAttachment,
  formatStrategyTimestamp,
  getMissingVerificationFields,
  mergeCollectedVerificationInput,
  normalizeWhatsAppPhone,
  parseTwilioMedia,
  type CollectedVerificationInput,
  type VerificationPaymentMethod,
  type TwilioWebhookPayload,
} from './whatsapp.helpers';
import { sendTwilioWhatsAppReply } from './whatsapp.twilio';
import { extractVerificationFromImage } from './whatsapp.vision';

interface ProcessWebhookResult {
  replyText: string;
  status: 'incomplete' | 'authorized' | 'blocked' | 'unauthorized' | 'unsupported';
  attemptId: string;
  companyId: string;
  conversationId: string | null;
  recipientPhoneNumber: string;
  channelPhoneNumber: string | null;
  messagingServiceSid: string | null;
}

type WhatsAppChannelRecord = Prisma.WhatsAppChannelGetPayload<{
  include: {
    company: true;
  };
}>;

type StoredWhatsAppAttemptRecord = Prisma.WhatsAppVerificationAttemptGetPayload<{
  include: {
    company: {
      include: {
        whatsAppChannel: true;
      };
    };
    conversation: true;
    inboundMessage: true;
  };
}>;

type WhatsAppAuthorizationResult =
  | Awaited<ReturnType<typeof authorizeVerification>>
  | Awaited<ReturnType<typeof authorizeBinanceVerification>>;

function getBinanceApiSummary(result: WhatsAppAuthorizationResult) {
  return 'binanceApi' in result ? result.binanceApi : null;
}

function parseStoredPartialPayload(value: unknown): Partial<CollectedVerificationInput> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as Partial<CollectedVerificationInput>;
}

function buildVerificationInput(
  method: Exclude<VerificationPaymentMethod, 'unknown'>,
  input: CollectedVerificationInput,
  strategy: { fechaOperacion: string; toleranciaMinutos: number; code: string },
): CreateManualVerificationInput {
  return {
    referenciaEsperada: input.reference ?? '',
    montoEsperado: input.amount ?? 0,
    moneda: method === 'binance' ? 'USD' : input.currency,
    fechaOperacion: strategy.fechaOperacion,
    toleranciaMinutos: strategy.toleranciaMinutos,
    bancoEsperado: method === 'binance' ? 'Binance' : input.bank,
    cuentaDestinoUltimos4: null,
    nombreClienteOpcional: input.customerName,
    notas: buildVerificationNotes(strategy, method),
  };
}

function buildSourceSummary(input: {
  textExtraction: ReturnType<typeof extractVerificationFromText>;
  imageExtraction: Awaited<ReturnType<typeof extractVerificationFromImage>>;
  mergedInput: CollectedVerificationInput;
  mediaCount: number;
}) {
  return {
    mediaCount: input.mediaCount,
    textExtraction: input.textExtraction,
    imageExtraction: input.imageExtraction,
    mergedInput: input.mergedInput,
  };
}

function mapResultStatus(status: ProcessWebhookResult['status']) {
  switch (status) {
    case 'authorized':
      return WhatsAppVerificationAttemptStatus.AUTHORIZED;
    case 'blocked':
      return WhatsAppVerificationAttemptStatus.BLOCKED;
    case 'unauthorized':
      return WhatsAppVerificationAttemptStatus.REJECTED_UNAUTHORIZED;
    case 'unsupported':
      return WhatsAppVerificationAttemptStatus.UNSUPPORTED;
    default:
      return WhatsAppVerificationAttemptStatus.INCOMPLETE;
  }
}

function normalizeWebhookBody(body: TwilioWebhookPayload) {
  return {
    ...body,
    Body: body.Body?.trim() ?? '',
  };
}

function parseFinalResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function extractReplyText(value: unknown) {
  const finalResult = parseFinalResult(value);
  return typeof finalResult.replyText === 'string' ? finalResult.replyText : null;
}

function extractDeliverySid(value: unknown) {
  const finalResult = parseFinalResult(value);
  const delivery =
    finalResult.delivery && typeof finalResult.delivery === 'object' && !Array.isArray(finalResult.delivery)
      ? (finalResult.delivery as Record<string, unknown>)
      : null;

  return typeof delivery?.twilioMessageSid === 'string' ? delivery.twilioMessageSid : null;
}

async function resolveChannelForPayload(
  payload: TwilioWebhookPayload,
): Promise<WhatsAppChannelRecord | null> {
  const toPhoneNumber = normalizeWhatsAppPhone(payload.To);
  const messagingServiceSid = payload.MessagingServiceSid?.trim() ?? null;
  const filters = [];

  if (toPhoneNumber) {
    filters.push({
      phoneNumber: toPhoneNumber,
    });
  }

  if (messagingServiceSid) {
    filters.push({
      messagingServiceSid,
    });
  }

  if (filters.length === 0) {
    return null;
  }

  return prisma.whatsAppChannel.findFirst({
    where: {
      isActive: true,
      OR: filters,
    },
    include: {
      company: true,
    },
  });
}

async function findExistingAttemptByMessageSid(messageSid: string): Promise<StoredWhatsAppAttemptRecord | null> {
  return prisma.whatsAppVerificationAttempt.findFirst({
    where: {
      inboundMessage: {
        is: {
          twilioMessageSid: messageSid,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      company: {
        include: {
          whatsAppChannel: true,
        },
      },
      conversation: true,
      inboundMessage: true,
    },
  });
}

function isAllowedPhone(phoneNumber: string, channel: WhatsAppChannelRecord | null) {
  if (!channel) {
    return false;
  }

  return channel.allowedTestNumbers.includes(phoneNumber);
}

async function upsertConversation(companyId: string, phoneNumber: string) {
  return prisma.whatsAppConversation.upsert({
    where: {
      companyId_phoneNumber: {
        companyId,
        phoneNumber,
      },
    },
    create: {
      companyId,
      phoneNumber,
      status: WhatsAppConversationStatus.IDLE,
      partialPayload: null,
      pendingFields: [],
    },
    update: {},
  });
}

async function createInboundMessage(input: {
  companyId: string;
  conversationId: string | null;
  payload: TwilioWebhookPayload;
  phoneNumber: string;
  toPhoneNumber: string | null;
}) {
  const media = parseTwilioMedia(input.payload);
  return prisma.whatsAppInboundMessage.create({
    data: {
      companyId: input.companyId,
      conversationId: input.conversationId ?? undefined,
      twilioMessageSid: input.payload.MessageSid ?? null,
      fromPhoneNumber: input.phoneNumber,
      toPhoneNumber: input.toPhoneNumber ?? undefined,
      bodyText: input.payload.Body ?? null,
      numMedia: media.length,
      media: media as never,
      rawPayload: input.payload as never,
    },
  });
}

async function persistAttempt(input: {
  companyId: string;
  conversationId: string | null;
  inboundMessageId: string | null;
  phoneNumber: string;
  status: ProcessWebhookResult['status'];
  sourceSummary: unknown;
  mergedInput: unknown;
  missingFields: string[];
  dateStrategies: unknown;
  finalResult: unknown;
  rawPayload: unknown;
}) {
  return prisma.whatsAppVerificationAttempt.create({
    data: {
      companyId: input.companyId,
      conversationId: input.conversationId ?? undefined,
      inboundMessageId: input.inboundMessageId ?? undefined,
      phoneNumber: input.phoneNumber,
      status: mapResultStatus(input.status),
      sourceSummary: input.sourceSummary as never,
      mergedInput: input.mergedInput as never,
      missingFields: input.missingFields as never,
      dateStrategies: input.dateStrategies as never,
      finalResult: input.finalResult as never,
      rawPayload: input.rawPayload as never,
    },
  });
}

async function persistOutboundReplyDelivery(input: {
  attemptId: string;
  existingFinalResult: unknown;
  companyId: string;
  conversationId: string | null;
  recipientPhoneNumber: string;
  channelPhoneNumber: string | null;
  replyText: string;
  twilioMessageSid: string;
  twilioStatus: string | null;
  rawPayload: unknown;
}) {
  await prisma.whatsAppInboundMessage.create({
    data: {
      companyId: input.companyId,
      conversationId: input.conversationId ?? undefined,
      twilioMessageSid: input.twilioMessageSid,
      fromPhoneNumber: input.channelPhoneNumber ?? 'unknown',
      toPhoneNumber: input.recipientPhoneNumber,
      direction: 'outbound',
      bodyText: input.replyText,
      numMedia: 0,
      media: [] as never,
      rawPayload: input.rawPayload as never,
    },
  });

  const finalResult = parseFinalResult(input.existingFinalResult);
  await prisma.whatsAppVerificationAttempt.update({
    where: {
      id: input.attemptId,
    },
    data: {
      finalResult: {
        ...finalResult,
        replyText: input.replyText,
        delivery: {
          channel: 'twilio_api',
          twilioMessageSid: input.twilioMessageSid,
          twilioStatus: input.twilioStatus,
          sentAt: new Date().toISOString(),
        },
      } as never,
    },
  });
}

async function deliverReplyViaTwilio(input: {
  attemptId: string;
  existingFinalResult: unknown;
  companyId: string;
  conversationId: string | null;
  recipientPhoneNumber: string;
  channelPhoneNumber: string | null;
  messagingServiceSid: string | null;
  replyText: string;
}) {
  const delivery = await sendTwilioWhatsAppReply({
    toPhoneNumber: input.recipientPhoneNumber,
    body: input.replyText,
    channelPhoneNumber: input.channelPhoneNumber,
    messagingServiceSid: input.messagingServiceSid,
  });

  await persistOutboundReplyDelivery({
    attemptId: input.attemptId,
    existingFinalResult: input.existingFinalResult,
    companyId: input.companyId,
    conversationId: input.conversationId,
    recipientPhoneNumber: input.recipientPhoneNumber,
    channelPhoneNumber: input.channelPhoneNumber,
    replyText: input.replyText,
    twilioMessageSid: delivery.sid,
    twilioStatus: delivery.status,
    rawPayload: delivery,
  });
}

export async function processIncomingTwilioWebhook(
  payload: TwilioWebhookPayload,
): Promise<ProcessWebhookResult> {
  const body = normalizeWebhookBody(payload);
  const phoneNumber = normalizeWhatsAppPhone(body.From) ?? 'unknown';
  const toPhoneNumber = normalizeWhatsAppPhone(body.To);
  const channel = await resolveChannelForPayload(body);
  const conversation =
    phoneNumber !== 'unknown' && channel ? await upsertConversation(channel.companyId, phoneNumber) : null;
  const inboundMessage =
    channel
      ? await createInboundMessage({
          companyId: channel.companyId,
          conversationId: conversation?.id ?? null,
          payload: body,
          phoneNumber,
          toPhoneNumber,
        })
      : null;

  if (!channel || !conversation || !inboundMessage || !isAllowedPhone(phoneNumber, channel)) {
    const replyText = buildUnauthorizedPhoneReply();
    const companyId = channel?.companyId ?? (await getCompanyBySlugOrThrow(DEFAULT_COMPANY_SLUG)).id;

    if (conversation && inboundMessage) {
      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          status: WhatsAppConversationStatus.BLOCKED,
          lastInboundMessageId: inboundMessage.id,
          lastInboundAt: inboundMessage.receivedAt,
          lastAttemptAt: inboundMessage.receivedAt,
        },
      });
    }

    const attempt = await persistAttempt({
      companyId,
      conversationId: conversation?.id ?? null,
      inboundMessageId: inboundMessage?.id ?? null,
      phoneNumber,
      status: 'unauthorized',
      sourceSummary: null,
      mergedInput: null,
      missingFields: [],
      dateStrategies: [],
      finalResult: {
        replyText,
      },
      rawPayload: body,
    });

    await writeAuditLog({
      companyId,
      actorType: ActorType.SYSTEM,
      action: 'whatsapp.attempt_processed',
      entityType: 'WhatsAppVerificationAttempt',
      entityId: attempt.id,
      metadata: {
        phoneNumber,
        status: 'unauthorized',
        twilioMessageSid: body.MessageSid ?? null,
      },
    });

    return {
      replyText,
      status: 'unauthorized',
      attemptId: attempt.id,
      companyId,
      conversationId: conversation?.id ?? null,
      recipientPhoneNumber: phoneNumber,
      channelPhoneNumber: channel?.phoneNumber ?? toPhoneNumber ?? null,
      messagingServiceSid: channel?.messagingServiceSid ?? body.MessagingServiceSid?.trim() ?? null,
    };
  }

  const media = parseTwilioMedia(body);
  const firstImage = findFirstImageAttachment(media);
  const hasUnsupportedMedia = media.length > 0 && !firstImage;
  const textExtraction = extractVerificationFromText(body.Body, inboundMessage.receivedAt);
  const imageExtraction = firstImage?.url
    ? await extractVerificationFromImage(firstImage.url, inboundMessage.receivedAt)
    : null;
  const mergedInput = mergeCollectedVerificationInput(
    parseStoredPartialPayload(conversation.partialPayload),
    textExtraction,
    imageExtraction,
  );
  const sourceSummary = buildSourceSummary({
    textExtraction,
    imageExtraction,
    mergedInput,
    mediaCount: media.length,
  });
  const verificationMethod = detectVerificationMethod({
    textExtraction,
    imageExtraction,
    mergedInput,
  });
  const missingFields = getMissingVerificationFields(mergedInput);
  const shouldSendImageFallback =
    Boolean(firstImage) &&
    imageExtraction !== null &&
    !imageExtraction.isTransferProof &&
    missingFields.length > 0;

  if (hasUnsupportedMedia && !body.Body?.trim()) {
    const replyText = buildUnsupportedMediaReply();
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        status: WhatsAppConversationStatus.IDLE,
        partialPayload: null,
        pendingFields: [],
        lastInboundMessageId: inboundMessage.id,
        lastInboundAt: inboundMessage.receivedAt,
        lastAttemptAt: inboundMessage.receivedAt,
      },
    });

    const attempt = await persistAttempt({
      companyId: channel.companyId,
      conversationId: conversation.id,
      inboundMessageId: inboundMessage.id,
      phoneNumber,
      status: 'unsupported',
      sourceSummary,
      mergedInput,
      missingFields: [],
      dateStrategies: [],
      finalResult: {
        replyText,
      },
      rawPayload: body,
    });

    return {
      replyText,
      status: 'unsupported',
      attemptId: attempt.id,
      companyId: channel.companyId,
      conversationId: conversation.id,
      recipientPhoneNumber: phoneNumber,
      channelPhoneNumber: channel.phoneNumber,
      messagingServiceSid: channel.messagingServiceSid,
    };
  }

  if (verificationMethod === 'unknown') {
    const replyText = shouldSendImageFallback
      ? buildImageFallbackReply()
      : buildUnknownMethodReply();

    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        status: WhatsAppConversationStatus.AWAITING_DETAILS,
        partialPayload: mergedInput as never,
        pendingFields: (shouldSendImageFallback ? missingFields : ['metodo']) as never,
        lastInboundMessageId: inboundMessage.id,
        lastInboundAt: inboundMessage.receivedAt,
        lastAttemptAt: inboundMessage.receivedAt,
      },
    });

    const attempt = await persistAttempt({
      companyId: channel.companyId,
      conversationId: conversation.id,
      inboundMessageId: inboundMessage.id,
      phoneNumber,
      status: 'incomplete',
      sourceSummary: {
        ...sourceSummary,
        verificationMethod,
      },
      mergedInput,
      missingFields: shouldSendImageFallback ? missingFields : ['metodo'],
      dateStrategies: [],
      finalResult: {
        replyText,
        verificationMethod,
      },
      rawPayload: body,
    });

    return {
      replyText,
      status: 'incomplete',
      attemptId: attempt.id,
      companyId: channel.companyId,
      conversationId: conversation.id,
      recipientPhoneNumber: phoneNumber,
      channelPhoneNumber: channel.phoneNumber,
      messagingServiceSid: channel.messagingServiceSid,
    };
  }

  if (missingFields.length > 0) {
    const replyText = shouldSendImageFallback
      ? buildImageFallbackReply()
      : buildMissingFieldsReply(missingFields);

    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        status: WhatsAppConversationStatus.AWAITING_DETAILS,
        partialPayload: mergedInput as never,
        pendingFields: missingFields as never,
        lastInboundMessageId: inboundMessage.id,
        lastInboundAt: inboundMessage.receivedAt,
        lastAttemptAt: inboundMessage.receivedAt,
      },
    });

    const attempt = await persistAttempt({
      companyId: channel.companyId,
      conversationId: conversation.id,
      inboundMessageId: inboundMessage.id,
      phoneNumber,
      status: 'incomplete',
      sourceSummary: {
        ...sourceSummary,
        verificationMethod,
      },
      mergedInput,
      missingFields,
      dateStrategies: [],
      finalResult: {
        replyText,
      },
      rawPayload: body,
    });

    await writeAuditLog({
      companyId: channel.companyId,
      actorType: ActorType.SYSTEM,
      action: 'whatsapp.attempt_processed',
      entityType: 'WhatsAppVerificationAttempt',
      entityId: attempt.id,
      metadata: {
        phoneNumber,
        status: 'incomplete',
        verificationMethod,
        missingFields,
        imageFallbackApplied: shouldSendImageFallback,
        visionFailureReason: imageExtraction?.failureReason ?? null,
        visionConfidence: imageExtraction?.confidence ?? null,
        visionRawTextPreview: imageExtraction?.rawText?.slice(0, 400) ?? null,
      },
    });

    return {
      replyText,
      status: 'incomplete',
      attemptId: attempt.id,
      companyId: channel.companyId,
      conversationId: conversation.id,
      recipientPhoneNumber: phoneNumber,
      channelPhoneNumber: channel.phoneNumber,
      messagingServiceSid: channel.messagingServiceSid,
    };
  }

  const verificationMoment = inboundMessage.receivedAt;
  const strategies = buildVerificationStrategies(mergedInput, verificationMoment, verificationMethod);
  const strategyResults: Array<{
    strategy: { code: string; label: string; fechaOperacion: string; toleranciaMinutos: number };
    result: WhatsAppAuthorizationResult;
  }> = [];

  for (const strategy of strategies) {
    const verificationInput = buildVerificationInput(verificationMethod, mergedInput, strategy);
    const result =
      verificationMethod === 'binance'
        ? await authorizeBinanceVerification(channel.company.slug, verificationInput)
        : await authorizeVerification(channel.company.slug, verificationInput);
    strategyResults.push({
      strategy,
      result,
    });
    if (result.authorized) {
      break;
    }
  }

  const selected = choosePreferredStrategyResult(strategyResults);
  if (!selected) {
    throw new Error('whatsapp_verification_strategy_missing');
  }

  const selectedBinanceApiSummary = getBinanceApiSummary(selected.result);
  const replyText = selected.result.authorized
    ? buildAuthorizedReply(verificationMethod, mergedInput, selected.strategy.label)
    : buildBlockedReply(verificationMethod, mergedInput, selected.result.reasonCode, selected.strategy.label, {
        binanceApiErrorCode: selectedBinanceApiSummary?.errorCode ?? null,
      });
  const shouldKeepDateFollowUpOpen = !selected.result.authorized && selected.result.reasonCode === 'date';

  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: {
      status: shouldKeepDateFollowUpOpen
        ? WhatsAppConversationStatus.AWAITING_DETAILS
        : WhatsAppConversationStatus.IDLE,
      partialPayload: shouldKeepDateFollowUpOpen ? (mergedInput as never) : null,
      pendingFields: shouldKeepDateFollowUpOpen ? (['fecha'] as never) : [],
      lastInboundMessageId: inboundMessage.id,
      lastInboundAt: inboundMessage.receivedAt,
      lastAttemptAt: inboundMessage.receivedAt,
    },
  });

  const attempt = await persistAttempt({
    companyId: channel.companyId,
    conversationId: conversation.id,
    inboundMessageId: inboundMessage.id,
    phoneNumber,
    status: selected.result.authorized ? 'authorized' : 'blocked',
    sourceSummary: {
      ...sourceSummary,
      verificationMethod,
    },
    mergedInput,
    missingFields: [],
    dateStrategies: strategyResults.map((item) => ({
      strategy: {
        ...item.strategy,
        formattedFechaOperacion: formatStrategyTimestamp(item.strategy),
      },
      result: {
        authorized: item.result.authorized,
        reasonCode: item.result.reasonCode,
        candidateCount: item.result.candidateCount,
        senderMatchType: item.result.senderMatchType,
        evidence: item.result.evidence,
        autoRefresh: item.result.autoRefresh,
        binanceApi: getBinanceApiSummary(item.result),
      },
    })),
    finalResult: {
      authorized: selected.result.authorized,
      reasonCode: selected.result.reasonCode,
      strategy: selected.strategy,
      verificationMethod,
      replyText,
      evidence: selected.result.evidence,
      binanceApi: selectedBinanceApiSummary,
    },
    rawPayload: body,
  });

  await writeAuditLog({
    companyId: channel.companyId,
    actorType: ActorType.SYSTEM,
    action: 'whatsapp.attempt_processed',
    entityType: 'WhatsAppVerificationAttempt',
    entityId: attempt.id,
    metadata: {
      phoneNumber,
      status: selected.result.authorized ? 'authorized' : 'blocked',
      verificationMethod,
      reasonCode: selected.result.reasonCode,
      strategyCode: selected.strategy.code,
      twilioMessageSid: body.MessageSid ?? null,
    },
  });

  return {
    replyText,
    status: selected.result.authorized ? 'authorized' : 'blocked',
    attemptId: attempt.id,
    companyId: channel.companyId,
    conversationId: conversation.id,
    recipientPhoneNumber: phoneNumber,
    channelPhoneNumber: channel.phoneNumber,
    messagingServiceSid: channel.messagingServiceSid,
  };
}

export async function listWhatsAppVerificationAttempts(companySlug: string, page = 1, pageSize = 20) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const query = paginationQuerySchema.parse({ page, pageSize });

  const [items, total] = await Promise.all([
    prisma.whatsAppVerificationAttempt.findMany({
      where: {
        companyId: company.id,
      },
      include: {
        company: true,
        inboundMessage: true,
        conversation: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.whatsAppVerificationAttempt.count({
      where: {
        companyId: company.id,
      },
    }),
  ]);

  return {
    items: items.map(serializeWhatsAppVerificationAttempt),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
    },
  };
}

export async function buildWebhookReplyXml(payload: TwilioWebhookPayload) {
  try {
    const messageSid = payload.MessageSid?.trim();
    const existingAttempt = messageSid ? await findExistingAttemptByMessageSid(messageSid) : null;
    if (existingAttempt) {
      const replyText = extractReplyText(existingAttempt.finalResult);
      if (replyText) {
        if (!extractDeliverySid(existingAttempt.finalResult)) {
          try {
            await deliverReplyViaTwilio({
              attemptId: existingAttempt.id,
              existingFinalResult: existingAttempt.finalResult,
              companyId: existingAttempt.companyId,
              conversationId: existingAttempt.conversationId,
              recipientPhoneNumber: existingAttempt.phoneNumber,
              channelPhoneNumber: existingAttempt.company.whatsAppChannel?.phoneNumber ?? null,
              messagingServiceSid: existingAttempt.company.whatsAppChannel?.messagingServiceSid ?? null,
              replyText,
            });
          } catch (error) {
            logger.error({ err: error, attemptId: existingAttempt.id }, 'WhatsApp outbound reply failed for existing attempt');
            return buildTwimlResponse(replyText);
          }
        }

        return buildTwimlResponse();
      }
    }

    const processed = await processIncomingTwilioWebhook(payload);
    try {
      await deliverReplyViaTwilio({
        attemptId: processed.attemptId,
        existingFinalResult: {
          replyText: processed.replyText,
        },
        companyId: processed.companyId,
        conversationId: processed.conversationId,
        recipientPhoneNumber: processed.recipientPhoneNumber,
        channelPhoneNumber: processed.channelPhoneNumber,
        messagingServiceSid: processed.messagingServiceSid,
        replyText: processed.replyText,
      });

      return buildTwimlResponse();
    } catch (error) {
      logger.error({ err: error, attemptId: processed.attemptId }, 'WhatsApp outbound reply failed');
      return buildTwimlResponse(processed.replyText);
    }
  } catch (error) {
    logger.error({ err: error }, 'WhatsApp webhook processing failed');
    return buildTwimlResponse('No pude procesar tu solicitud en este momento. Intenta de nuevo.');
  }
}
