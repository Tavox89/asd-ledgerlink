import { GmailWatchStatus } from '@prisma/client';
import { v1 } from '@google-cloud/pubsub';

import { env } from '../../config/env';
import { writeAuditLog } from '../../lib/audit';
import { ApiError } from '../../lib/http';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';
import { fetchAndIngestMessageByIdForEmailAccount, getAuthorizedGmailClientForEmail } from '../gmail/gmail.service';

interface GmailPushPayload {
  emailAddress: string;
  historyId: string;
}

interface CachedWatchContext {
  accountId: string;
  companyId: string;
  gmail: Awaited<ReturnType<typeof getAuthorizedGmailClientForEmail>>['gmail'];
  watchId: string;
  currentHistoryId: string;
}

function normalizePubSubError(error: unknown) {
  if (error instanceof Error && error.message.includes('Could not load the default credentials')) {
    return new ApiError(
      503,
      'google_cloud_credentials_missing',
      'Pub/Sub pull requires Google Cloud Application Default Credentials. Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON with Pub/Sub Subscriber access.',
    );
  }

  return error;
}

function decodePubSubMessage(data?: Uint8Array | null): GmailPushPayload | null {
  if (!data) {
    return null;
  }

  const raw = Buffer.from(data).toString('utf8');
  return JSON.parse(raw) as GmailPushPayload;
}

async function buildWatchContext(emailAddress: string): Promise<CachedWatchContext | null> {
  try {
    const { account, gmail } = await getAuthorizedGmailClientForEmail(emailAddress);
    const latestWatch = await prisma.gmailWatch.findFirst({
      where: {
        gmailAccountId: account.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!latestWatch) {
      logger.warn({ emailAddress }, 'Skipping Pub/Sub message because no Gmail watch exists.');
      return null;
    }

    return {
      accountId: account.id,
      companyId: account.companyId,
      gmail,
      watchId: latestWatch.id,
      currentHistoryId: latestWatch.historyId,
    };
  } catch (error) {
    logger.warn({ err: error, emailAddress }, 'Skipping Pub/Sub message for unmanaged Gmail account.');
    return null;
  }
}

export async function pullGmailPubSubMessages(companySlug?: string, maxMessages = 10) {
  const subscriber = new v1.SubscriberClient();
  let response;

  try {
    [response] = await subscriber.pull({
      subscription: env.GMAIL_PUBSUB_SUBSCRIPTION,
      maxMessages,
    });
  } catch (error) {
    throw normalizePubSubError(error);
  }

  const receivedMessages = response.receivedMessages ?? [];
  if (receivedMessages.length === 0) {
    return {
      pulled: 0,
      processed: 0,
      messages: [],
    };
  }

  let targetEmailAddress: string | null = null;
  if (companySlug) {
    const company = await getCompanyBySlugOrThrow(companySlug);
    const account = await prisma.gmailAccount.findFirst({
      where: {
        companyId: company.id,
      },
      select: {
        email: true,
      },
    });

    if (!account?.email) {
      throw new ApiError(
        409,
        'gmail_not_connected',
        'Gmail account is not connected yet. Complete OAuth first.',
      );
    }

    targetEmailAddress = account.email;
  }

  const contextCache = new Map<string, CachedWatchContext | null>();
  const ingestedItems = [];
  const ackIds: string[] = [];
  const watchActivity = new Map<string, { companyId: string; pulled: number; processed: number }>();

  for (const message of receivedMessages) {
    const payload = decodePubSubMessage(message.message?.data ?? null);
    const ackId = message.ackId ?? null;
    const emailAddress = payload?.emailAddress ?? null;

    if (!payload?.historyId || !emailAddress) {
      if (ackId) {
        ackIds.push(ackId);
      }
      continue;
    }

    if (targetEmailAddress && emailAddress !== targetEmailAddress) {
      continue;
    }

    let context = contextCache.get(emailAddress);
    if (context === undefined) {
      context = await buildWatchContext(emailAddress);
      contextCache.set(emailAddress, context);
    }

    if (!context) {
      if (ackId) {
        ackIds.push(ackId);
      }
      continue;
    }

    let pageToken: string | undefined;
    const newMessageIds = new Set<string>();
    let latestHistoryId = payload.historyId;

    try {
      do {
        const historyResponse = await context.gmail.users.history.list({
          userId: 'me',
          startHistoryId: context.currentHistoryId,
          pageToken,
          historyTypes: ['messageAdded'],
          maxResults: 100,
        });

        latestHistoryId = historyResponse.data.historyId ?? latestHistoryId;
        for (const historyItem of historyResponse.data.history ?? []) {
          for (const messageAdded of historyItem.messagesAdded ?? []) {
            const messageId = messageAdded.message?.id;
            if (messageId) {
              newMessageIds.add(messageId);
            }
          }
        }

        pageToken = historyResponse.data.nextPageToken ?? undefined;
      } while (pageToken);
    } catch (error) {
      await prisma.gmailWatch.update({
        where: {
          id: context.watchId,
        },
        data: {
          status: GmailWatchStatus.ERROR,
          lastError: error instanceof Error ? error.message : 'Unknown Gmail history error',
        },
      });
      throw error;
    }

    for (const gmailMessageId of newMessageIds) {
      const ingested = await fetchAndIngestMessageByIdForEmailAccount(emailAddress, gmailMessageId);
      ingestedItems.push(ingested);
    }

    await prisma.gmailWatch.update({
      where: { id: context.watchId },
      data: {
        historyId: latestHistoryId,
        lastPulledAt: new Date(),
        status: GmailWatchStatus.ACTIVE,
        lastError: null,
      },
    });

    context.currentHistoryId = latestHistoryId;
    watchActivity.set(context.watchId, {
      companyId: context.companyId,
      pulled: (watchActivity.get(context.watchId)?.pulled ?? 0) + 1,
      processed: (watchActivity.get(context.watchId)?.processed ?? 0) + newMessageIds.size,
    });

    if (ackId) {
      ackIds.push(ackId);
    }
  }

  if (ackIds.length > 0) {
    await subscriber.acknowledge({
      subscription: env.GMAIL_PUBSUB_SUBSCRIPTION,
      ackIds,
    });
  }

  logger.info(
    {
      pulled: ackIds.length,
      ingested: ingestedItems.length,
      targetEmailAddress,
    },
    'Processed Gmail Pub/Sub pull batch',
  );

  for (const [watchId, activity] of watchActivity.entries()) {
    await writeAuditLog({
      companyId: activity.companyId,
      actorType: 'JOB',
      action: 'gmail.pubsub_pull',
      entityType: 'GmailWatch',
      entityId: watchId,
      metadata: {
        pulled: activity.pulled,
        ingested: activity.processed,
      },
    });
  }

  return {
    pulled: ackIds.length,
    processed: ingestedItems.length,
    messages: ingestedItems,
  };
}
