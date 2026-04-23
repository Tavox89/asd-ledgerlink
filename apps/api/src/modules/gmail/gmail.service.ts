import type { Prisma } from '@prisma/client';
import type { AuthStatus } from '@prisma/client';
import { google } from 'googleapis';

import { env } from '../../config/env';
import { writeAuditLog } from '../../lib/audit';
import { ApiError } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { GmailWatchStatus, TransferEvidenceStatus } from '../../lib/prisma-runtime';
import { serializeGmailAccount, serializeInboundEmail } from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';
import { ingestNormalizedEmail } from '../email-processing/ingestion.service';
import { normalizeGmailMessage } from './gmail-normalizer';

type GmailAccountWithRelations = Prisma.GmailAccountGetPayload<{
  include: {
    company: true;
    token: true;
    watches: true;
  };
}>;

function gmailAccountInclude() {
  return {
    company: true,
    token: true,
    watches: {
      orderBy: {
        createdAt: 'desc' as const,
      },
      take: 1,
    },
  };
}

export function createOAuthClient() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new ApiError(
      500,
      'google_oauth_not_configured',
      'Google OAuth credentials are missing in the backend environment.',
    );
  }

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

async function getCompanyGmailAccountOrThrow(companySlug: string) {
  const account = await prisma.gmailAccount.findFirst({
    where: {
      company: {
        slug: companySlug,
      },
    },
    include: gmailAccountInclude(),
  });

  if (!account?.token) {
    throw new ApiError(
      409,
      'gmail_not_connected',
      'Gmail account is not connected yet. Complete OAuth first.',
    );
  }

  return account;
}

async function getGmailAccountByEmailOrThrow(email: string) {
  const account = await prisma.gmailAccount.findUnique({
    where: {
      email,
    },
    include: gmailAccountInclude(),
  });

  if (!account?.token) {
    throw new ApiError(
      409,
      'gmail_not_connected',
      'Gmail account is not connected yet. Complete OAuth first.',
    );
  }

  return account;
}

async function buildAuthorizedGmailClient(account: GmailAccountWithRelations) {
  const oauthClient = createOAuthClient();
  oauthClient.setCredentials({
    access_token: account.token?.accessToken,
    refresh_token: account.token?.refreshToken ?? undefined,
    expiry_date: account.token?.expiryDate?.getTime(),
    scope: account.token?.scope,
    token_type: account.token?.tokenType ?? undefined,
  });

  oauthClient.on('tokens', async (tokens) => {
    await prisma.gmailToken.update({
      where: {
        gmailAccountId: account.id,
      },
      data: {
        accessToken: tokens.access_token ?? account.token?.accessToken ?? '',
        refreshToken: tokens.refresh_token ?? account.token?.refreshToken,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : account.token?.expiryDate,
        scope: tokens.scope ?? account.token?.scope ?? '',
        tokenType: tokens.token_type ?? account.token?.tokenType,
      },
    });
  });

  return {
    account,
    oauthClient,
    gmail: google.gmail({ version: 'v1', auth: oauthClient }),
  };
}

export async function getAuthorizedGmailClientForCompany(companySlug: string) {
  const account = await getCompanyGmailAccountOrThrow(companySlug);
  return buildAuthorizedGmailClient(account);
}

export async function getAuthorizedGmailClientForEmail(email: string) {
  const account = await getGmailAccountByEmailOrThrow(email);
  return buildAuthorizedGmailClient(account);
}

export function getGoogleAuthStartUrl(companySlug: string) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    include_granted_scopes: true,
    state: companySlug,
  });
}

export async function handleGoogleOAuthCallback(code: string, companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const gmail = google.gmail({ version: 'v1', auth: client });
  const profileResponse = await gmail.users.getProfile({ userId: 'me' });

  const email = profileResponse.data.emailAddress;
  if (!email) {
    throw new ApiError(502, 'google_profile_missing_email', 'Google did not return an email address.');
  }

  const existingByEmail = await prisma.gmailAccount.findUnique({
    where: {
      email,
    },
  });

  if (existingByEmail && existingByEmail.companyId !== company.id) {
    throw new ApiError(
      409,
      'gmail_account_already_linked',
      'That Gmail inbox is already linked to another company profile.',
    );
  }

  const account = await prisma.gmailAccount.upsert({
    where: {
      companyId: company.id,
    },
    create: {
      companyId: company.id,
      email,
      googleAccountId: undefined,
      displayName: undefined,
      profileSnapshot: {
        profile: profileResponse.data,
      },
      token: {
        create: {
          accessToken: tokens.access_token ?? '',
          refreshToken: tokens.refresh_token ?? undefined,
          scope: tokens.scope ?? '',
          tokenType: tokens.token_type ?? undefined,
          expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        },
      },
    },
    update: {
      email,
      profileSnapshot: {
        profile: profileResponse.data,
      },
      connectedAt: new Date(),
      token: {
        upsert: {
          create: {
            accessToken: tokens.access_token ?? '',
            refreshToken: tokens.refresh_token ?? undefined,
            scope: tokens.scope ?? '',
            tokenType: tokens.token_type ?? undefined,
            expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          },
          update: {
            accessToken: tokens.access_token ?? '',
            refreshToken: tokens.refresh_token ?? undefined,
            scope: tokens.scope ?? '',
            tokenType: tokens.token_type ?? undefined,
            expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          },
        },
      },
    },
    include: gmailAccountInclude(),
  });

  await writeAuditLog({
    companyId: company.id,
    actorType: 'SYSTEM',
    action: 'gmail.connected',
    entityType: 'GmailAccount',
    entityId: account.id,
    after: {
      email: account.email,
    },
  });

  return serializeGmailAccount(account);
}

export async function getGmailProfile(companySlug: string) {
  const { account, gmail } = await getAuthorizedGmailClientForCompany(companySlug);
  const profile = await gmail.users.getProfile({
    userId: 'me',
  });

  await prisma.gmailAccount.update({
    where: { id: account.id },
    data: {
      lastSyncedAt: new Date(),
      profileSnapshot: {
        profile: profile.data,
      },
    },
  });

  const refreshed = await prisma.gmailAccount.findUnique({
    where: { id: account.id },
    include: gmailAccountInclude(),
  });

  return {
    account: refreshed ? serializeGmailAccount(refreshed) : null,
    profile: profile.data,
  };
}

export async function listStoredGmailMessages(
  companySlug: string,
  page = 1,
  pageSize = 20,
  processingStatus?: string,
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const where = {
    companyId: company.id,
    processingStatus: processingStatus
      ? (processingStatus.toUpperCase() as
          | 'RECEIVED'
          | 'PARSED'
          | 'MATCHED'
          | 'NEEDS_REVIEW'
          | 'IGNORED'
          | 'REJECTED')
      : undefined,
  };

  const [items, total] = await Promise.all([
    prisma.inboundEmail.findMany({
      where,
      include: {
        company: true,
        parsedNotification: true,
        matches: true,
      },
      orderBy: {
        receivedAt: 'desc',
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.inboundEmail.count({ where }),
  ]);

  return {
    items: items.map(serializeInboundEmail),
    pagination: {
      page,
      pageSize,
      total,
    },
  };
}

export async function syncRecentInboxMessages(companySlug: string, maxMessages = 10, query?: string) {
  const { account, gmail } = await getAuthorizedGmailClientForCompany(companySlug);
  const response = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX'],
    maxResults: maxMessages,
    q: query,
    includeSpamTrash: false,
  });

  const messageIds = (response.data.messages ?? [])
    .map((message) => message.id)
    .filter((id): id is string => Boolean(id));

  const ingestedItems = [];
  for (const gmailMessageId of messageIds) {
    const messageResponse = await gmail.users.messages.get({
      userId: 'me',
      id: gmailMessageId,
      format: 'full',
    });

    if (!messageResponse.data.id) {
      continue;
    }

    const normalized = normalizeGmailMessage(messageResponse.data);
    const ingested = await ingestNormalizedEmail(account.companyId, account.id, normalized);
    ingestedItems.push(ingested);
  }

  await prisma.gmailAccount.update({
    where: { id: account.id },
    data: {
      lastSyncedAt: new Date(),
    },
  });

  await writeAuditLog({
    companyId: account.companyId,
    actorType: 'USER',
    action: 'gmail.manual_sync',
    entityType: 'GmailAccount',
    entityId: account.id,
    metadata: {
      listed: messageIds.length,
      processed: ingestedItems.length,
      query: query ?? null,
    },
  });

  return {
    listed: messageIds.length,
    processed: ingestedItems.length,
    messages: ingestedItems,
  };
}

export async function getStoredGmailMessageById(companySlug: string, id: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const item = await prisma.inboundEmail.findFirst({
    where: {
      id,
      companyId: company.id,
    },
    include: {
      company: true,
      parsedNotification: true,
      matches: true,
      headers: true,
      reviews: true,
    },
  });

  if (!item) {
    throw new ApiError(404, 'email_not_found', 'Inbound email not found.');
  }

  return {
    ...serializeInboundEmail(item),
    headers: item.headers,
    reviews: item.reviews,
  };
}

export async function registerGmailWatch(companySlug: string) {
  const { account, gmail } = await getAuthorizedGmailClientForCompany(companySlug);
  const response = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: env.GMAIL_PUBSUB_TOPIC,
      labelIds: ['INBOX'],
    },
  });

  const watch = await prisma.gmailWatch.create({
    data: {
      gmailAccountId: account.id,
      topicName: env.GMAIL_PUBSUB_TOPIC,
      subscriptionName: env.GMAIL_PUBSUB_SUBSCRIPTION,
      historyId: response.data.historyId ?? '0',
      expirationAt: response.data.expiration
        ? new Date(Number(response.data.expiration))
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: GmailWatchStatus.ACTIVE,
    },
  });

  await writeAuditLog({
    companyId: account.companyId,
    actorType: 'SYSTEM',
    action: 'gmail.watch_registered',
    entityType: 'GmailWatch',
    entityId: watch.id,
    after: {
      historyId: watch.historyId,
      expirationAt: watch.expirationAt,
    },
  });

  return watch;
}

export async function renewGmailWatch(companySlug: string) {
  return registerGmailWatch(companySlug);
}

export async function fetchMessageById(companySlug: string, gmailMessageId: string) {
  const { gmail } = await getAuthorizedGmailClientForCompany(companySlug);
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: gmailMessageId,
    format: 'full',
  });

  if (!response.data.id) {
    throw new ApiError(404, 'gmail_message_not_found', 'Message not found in Gmail API.');
  }

  return response.data;
}

export async function fetchAndIngestMessageById(
  companySlug: string,
  gmailMessageId: string,
) {
  const { account } = await getAuthorizedGmailClientForCompany(companySlug);
  const message = await fetchMessageById(companySlug, gmailMessageId);
  const normalized = normalizeGmailMessage(message);
  return ingestNormalizedEmail(account.companyId, account.id, normalized);
}

export async function fetchAndIngestMessageByIdForEmailAccount(
  accountEmail: string,
  gmailMessageId: string,
) {
  const { account, gmail } = await getAuthorizedGmailClientForEmail(accountEmail);
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: gmailMessageId,
    format: 'full',
  });

  if (!response.data.id) {
    throw new ApiError(404, 'gmail_message_not_found', 'Message not found in Gmail API.');
  }

  const normalized = normalizeGmailMessage(response.data);
  return ingestNormalizedEmail(account.companyId, account.id, normalized);
}

export async function refreshTransferEvidenceAfterManualConfirmation(
  expectedTransferId: string,
  decision: 'confirm' | 'reject',
  note?: string,
) {
  const transfer = await prisma.expectedTransfer.update({
    where: {
      id: expectedTransferId,
    },
    data: {
      status:
        decision === 'confirm'
          ? TransferEvidenceStatus.CONFIRMED_MANUAL
          : TransferEvidenceStatus.REJECTED,
      confirmedAt: decision === 'confirm' ? new Date() : null,
      rejectedAt: decision === 'reject' ? new Date() : null,
      notes: note,
    },
  });

  await writeAuditLog({
    companyId: transfer.companyId,
    actorType: 'USER',
    action: decision === 'confirm' ? 'transfer.confirmed_manual' : 'transfer.rejected',
    entityType: 'ExpectedTransfer',
    entityId: transfer.id,
    after: {
      status: transfer.status,
    },
  });

  return transfer;
}

export function toInboundAuthStatus(status: AuthStatus) {
  return status.toLowerCase();
}
