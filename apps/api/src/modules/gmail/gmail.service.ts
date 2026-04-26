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

interface GmailOAuthState {
  companySlug: string;
  gmailAccountId?: string | null;
}

interface GmailProfileSnapshot {
  emailAddress?: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
}

interface GmailAccountOperationError {
  code: string;
  message: string;
}

interface GmailAccountOperationResult {
  gmailAccountId: string;
  email: string;
  listed?: number;
  processed?: number;
  pulled?: number;
  watch?: ReturnType<typeof serializeGmailAccount>['watch'];
  error?: GmailAccountOperationError | null;
}

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

const gmailAccountOrderBy = [{ connectedAt: 'asc' as const }, { email: 'asc' as const }];

function normalizeOperationError(error: unknown): GmailAccountOperationError {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return {
    code: 'unexpected_error',
    message: error instanceof Error ? error.message : 'Unexpected Gmail operation failure.',
  };
}

function encodeGoogleOAuthState(state: GmailOAuthState) {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function parseGoogleOAuthState(rawState?: string | null): GmailOAuthState {
  const fallbackCompanySlug = rawState?.trim() || 'default';
  if (!rawState) {
    return {
      companySlug: 'default',
      gmailAccountId: null,
    };
  }

  try {
    const decoded = JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8')) as GmailOAuthState;
    if (decoded?.companySlug) {
      return {
        companySlug: decoded.companySlug,
        gmailAccountId: decoded.gmailAccountId ?? null,
      };
    }
  } catch {
    // Backward compatibility with the old plain-slug state.
  }

  return {
    companySlug: fallbackCompanySlug,
    gmailAccountId: null,
  };
}

function readStoredProfileSnapshot(
  account: Pick<GmailAccountWithRelations, 'profileSnapshot'>,
): GmailProfileSnapshot | null {
  const snapshot = (account.profileSnapshot as { profile?: GmailProfileSnapshot } | null | undefined)?.profile;
  return snapshot
    ? {
        emailAddress: snapshot.emailAddress,
        messagesTotal: snapshot.messagesTotal,
        threadsTotal: snapshot.threadsTotal,
        historyId: snapshot.historyId,
      }
    : null;
}

export function buildWatchHealthSummary(
  accounts: Array<Pick<GmailAccountWithRelations, 'watches'>>,
) {
  return accounts.reduce(
    (summary, account) => {
      const status = account.watches?.[0]?.status;
      summary.total += 1;

      if (!status) {
        summary.pending += 1;
        return summary;
      }

      switch (status) {
        case GmailWatchStatus.ACTIVE:
          summary.active += 1;
          break;
        case GmailWatchStatus.ERROR:
          summary.error += 1;
          break;
        case GmailWatchStatus.EXPIRED:
          summary.expired += 1;
          break;
        default:
          summary.pending += 1;
          break;
      }

      return summary;
    },
    { total: 0, active: 0, pending: 0, error: 0, expired: 0 },
  );
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

async function listCompanyGmailAccounts(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const accounts = await prisma.gmailAccount.findMany({
    where: {
      companyId: company.id,
    },
    include: gmailAccountInclude(),
    orderBy: gmailAccountOrderBy,
  });

  return {
    company,
    accounts,
  };
}

async function getConnectedCompanyGmailAccountsOrThrow(companySlug: string) {
  const { company, accounts } = await listCompanyGmailAccounts(companySlug);
  const connectedAccounts = accounts.filter((account) => Boolean(account.token));

  if (connectedAccounts.length === 0) {
    throw new ApiError(
      409,
      'gmail_not_connected',
      'Gmail account is not connected yet. Complete OAuth first.',
    );
  }

  return {
    company,
    accounts: connectedAccounts,
  };
}

async function getCompanyGmailAccountOrThrow(
  companySlug: string,
  gmailAccountId: string,
  requireToken = true,
) {
  const account = await prisma.gmailAccount.findFirst({
    where: {
      id: gmailAccountId,
      company: {
        slug: companySlug,
      },
    },
    include: gmailAccountInclude(),
  });

  if (!account) {
    throw new ApiError(404, 'gmail_account_not_found', 'Gmail inbox not found for that company.');
  }

  if (requireToken && !account.token) {
    throw new ApiError(
      409,
      'gmail_not_connected',
      'Gmail account is not connected yet. Complete OAuth first.',
    );
  }

  return account;
}

async function getCompanyGmailAccountByEmailOrThrow(email: string) {
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

async function syncRecentInboxMessagesForAccount(
  account: GmailAccountWithRelations,
  maxMessages = 10,
  query?: string,
) {
  const { gmail } = await buildAuthorizedGmailClient(account);
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
    gmailAccountId: account.id,
    email: account.email,
    listed: messageIds.length,
    processed: ingestedItems.length,
    messages: ingestedItems,
  };
}

async function registerGmailWatchForAccount(account: GmailAccountWithRelations) {
  const { gmail } = await buildAuthorizedGmailClient(account);
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

  return {
    gmailAccountId: account.id,
    email: account.email,
    watch: {
      id: watch.id,
      historyId: watch.historyId,
      topicName: watch.topicName,
      subscriptionName: watch.subscriptionName,
      status: watch.status.toLowerCase(),
      expirationAt: watch.expirationAt,
      lastPulledAt: watch.lastPulledAt,
      lastError: watch.lastError,
    },
  };
}

export async function getAuthorizedGmailClientForCompany(companySlug: string) {
  const { accounts } = await getConnectedCompanyGmailAccountsOrThrow(companySlug);
  return buildAuthorizedGmailClient(accounts[0]);
}

export async function getAuthorizedGmailClientForCompanyAccount(
  companySlug: string,
  gmailAccountId: string,
) {
  const account = await getCompanyGmailAccountOrThrow(companySlug, gmailAccountId);
  return buildAuthorizedGmailClient(account);
}

export async function getAuthorizedGmailClientForEmail(email: string) {
  const account = await getCompanyGmailAccountByEmailOrThrow(email);
  return buildAuthorizedGmailClient(account);
}

export async function getGoogleAuthStartUrl(companySlug: string, gmailAccountId?: string) {
  await getCompanyBySlugOrThrow(companySlug);

  if (gmailAccountId) {
    await getCompanyGmailAccountOrThrow(companySlug, gmailAccountId, false);
  }

  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    include_granted_scopes: true,
    state: encodeGoogleOAuthState({
      companySlug,
      gmailAccountId: gmailAccountId ?? null,
    }),
  });
}

export async function handleGoogleOAuthCallback(code: string, rawState?: string | null) {
  const state = parseGoogleOAuthState(rawState);
  const company = await getCompanyBySlugOrThrow(state.companySlug);
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
    include: gmailAccountInclude(),
  });

  if (existingByEmail && existingByEmail.companyId !== company.id) {
    throw new ApiError(
      409,
      'gmail_account_already_linked',
      'That Gmail inbox is already linked to another company profile.',
    );
  }

  if (state.gmailAccountId) {
    const reconnectAccount = await getCompanyGmailAccountOrThrow(company.slug, state.gmailAccountId, false);
    if (existingByEmail && existingByEmail.id !== reconnectAccount.id) {
      throw new ApiError(
        409,
        'gmail_account_reconnect_mismatch',
        'That Gmail inbox is already connected to a different mailbox slot in this company.',
      );
    }
  }

  const targetAccountId = state.gmailAccountId ?? existingByEmail?.id ?? null;
  const profileSnapshot = {
    profile: profileResponse.data,
  };

  const account = targetAccountId
    ? await prisma.gmailAccount.update({
        where: {
          id: targetAccountId,
        },
        data: {
          email,
          profileSnapshot,
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
      })
    : await prisma.gmailAccount.create({
        data: {
          companyId: company.id,
          email,
          googleAccountId: undefined,
          displayName: undefined,
          profileSnapshot,
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

  return {
    companySlug: company.slug,
    account: serializeGmailAccount(account),
  };
}

export async function getGmailProfile(companySlug: string) {
  const { accounts } = await listCompanyGmailAccounts(companySlug);
  const serializedAccounts = accounts.map((account) => ({
    ...serializeGmailAccount(account),
    profile: readStoredProfileSnapshot(account),
  }));

  const summary = {
    connectedInboxCount: serializedAccounts.filter((account) => account.hasToken).length,
    totalMessages: serializedAccounts.reduce((sum, account) => sum + (account.profile?.messagesTotal ?? 0), 0),
    totalThreads: serializedAccounts.reduce((sum, account) => sum + (account.profile?.threadsTotal ?? 0), 0),
    watchHealthSummary: buildWatchHealthSummary(accounts),
  };

  return {
    accounts: serializedAccounts,
    summary,
    account: serializedAccounts[0] ?? null,
    profile: serializedAccounts[0]?.profile ?? null,
  };
}

export async function listStoredGmailMessages(
  companySlug: string,
  page = 1,
  pageSize = 20,
  processingStatus?: string,
  gmailAccountId?: string,
) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const where = {
    companyId: company.id,
    gmailAccountId: gmailAccountId ?? undefined,
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
        gmailAccount: true,
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

export async function syncRecentInboxMessages(
  companySlug: string,
  maxMessages = 10,
  query?: string,
) {
  const { accounts } = await getConnectedCompanyGmailAccountsOrThrow(companySlug);
  const results: GmailAccountOperationResult[] = [];
  const messages = [];

  for (const account of accounts) {
    try {
      const result = await syncRecentInboxMessagesForAccount(account, maxMessages, query);
      results.push({
        gmailAccountId: result.gmailAccountId,
        email: result.email,
        listed: result.listed,
        processed: result.processed,
        error: null,
      });
      messages.push(...result.messages);
    } catch (error) {
      results.push({
        gmailAccountId: account.id,
        email: account.email,
        error: normalizeOperationError(error),
      });
    }
  }

  return {
    totalAccounts: accounts.length,
    succeeded: results.filter((result) => !result.error).length,
    failed: results.filter((result) => result.error).length,
    listed: results.reduce((sum, result) => sum + (result.listed ?? 0), 0),
    processed: results.reduce((sum, result) => sum + (result.processed ?? 0), 0),
    messages,
    results,
  };
}

export async function syncRecentInboxMessagesForCompanyAccount(
  companySlug: string,
  gmailAccountId: string,
  maxMessages = 10,
  query?: string,
) {
  const account = await getCompanyGmailAccountOrThrow(companySlug, gmailAccountId);
  const result = await syncRecentInboxMessagesForAccount(account, maxMessages, query);

  return {
    gmailAccountId: result.gmailAccountId,
    email: result.email,
    listed: result.listed,
    processed: result.processed,
    error: null,
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
      gmailAccount: true,
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
  const { accounts } = await getConnectedCompanyGmailAccountsOrThrow(companySlug);
  const results: GmailAccountOperationResult[] = [];

  for (const account of accounts) {
    try {
      const result = await registerGmailWatchForAccount(account);
      results.push({
        gmailAccountId: result.gmailAccountId,
        email: result.email,
        watch: result.watch,
        error: null,
      });
    } catch (error) {
      results.push({
        gmailAccountId: account.id,
        email: account.email,
        error: normalizeOperationError(error),
      });
    }
  }

  return {
    totalAccounts: accounts.length,
    succeeded: results.filter((result) => !result.error).length,
    failed: results.filter((result) => result.error).length,
    results,
  };
}

export async function registerGmailWatchForCompanyAccount(companySlug: string, gmailAccountId: string) {
  const account = await getCompanyGmailAccountOrThrow(companySlug, gmailAccountId);
  const result = await registerGmailWatchForAccount(account);

  return {
    gmailAccountId: result.gmailAccountId,
    email: result.email,
    watch: result.watch,
    error: null,
  };
}

export async function renewGmailWatch(companySlug: string) {
  return registerGmailWatch(companySlug);
}

export async function renewGmailWatchForCompanyAccount(companySlug: string, gmailAccountId: string) {
  return registerGmailWatchForCompanyAccount(companySlug, gmailAccountId);
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
