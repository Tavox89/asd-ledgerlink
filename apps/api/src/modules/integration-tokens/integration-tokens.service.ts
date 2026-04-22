import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { ActorType } from '@prisma/client';
import type {
  CreateIntegrationApiTokenInput,
  IntegrationTokenScope,
} from '@ledgerlink/shared';

import { writeAuditLog } from '../../lib/audit';
import { ApiError } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { serializeIntegrationApiToken } from '../../lib/serializers';
import { getCompanyBySlugOrThrow } from '../companies/companies.service';

const TOKEN_PATTERN = /^(legtk|asdll)_([a-f0-9]{12})_([A-Za-z0-9_-]{24,})$/i;
const TOKEN_PUBLIC_ID_BYTES = 6;
const TOKEN_SECRET_BYTES = 32;
const TOKEN_SCHEME_PREFIX = 'legtk';

export interface AuthenticatedIntegrationToken {
  id: string;
  companyId: string;
  companySlug: string;
  tokenPrefix: string;
  scopes: IntegrationTokenScope[];
}

function normalizeScopes(scopes: string[]) {
  return [...new Set(scopes)].sort() as IntegrationTokenScope[];
}

function buildTokenPrefix() {
  return `${TOKEN_SCHEME_PREFIX}_${randomBytes(TOKEN_PUBLIC_ID_BYTES).toString('hex')}`;
}

function buildTokenSecret() {
  return randomBytes(TOKEN_SECRET_BYTES).toString('base64url');
}

export function hashIntegrationTokenSecret(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function compareTokenHashes(leftHex: string, rightHex: string) {
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function parseIntegrationToken(rawToken: string) {
  const normalized = rawToken.trim();
  const match = normalized.match(TOKEN_PATTERN);
  if (!match) {
    return null;
  }

  const [, scheme, publicId, secret] = match;

  return {
    tokenPrefix: `${scheme.toLowerCase()}_${publicId.toLowerCase()}`,
    secret,
  };
}

function buildIssuedTokenMaterial() {
  const tokenPrefix = buildTokenPrefix();
  const secret = buildTokenSecret();

  return {
    tokenPrefix,
    secret,
    token: `${tokenPrefix}_${secret}`,
    tokenHash: hashIntegrationTokenSecret(secret),
  };
}

export async function listIntegrationApiTokens(companySlug: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const tokens = await prisma.integrationApiToken.findMany({
    where: {
      companyId: company.id,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      company: true,
    },
  });

  return tokens.map(serializeIntegrationApiToken);
}

export async function createIntegrationApiToken(companySlug: string, input: CreateIntegrationApiTokenInput) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const issued = buildIssuedTokenMaterial();

  const record = await prisma.integrationApiToken.create({
    data: {
      companyId: company.id,
      name: input.name,
      tokenPrefix: issued.tokenPrefix,
      tokenHash: issued.tokenHash,
      scopes: normalizeScopes(input.scopes),
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      createdByUserId: input.createdByUserId ?? undefined,
    },
    include: {
      company: true,
    },
  });

  await writeAuditLog({
    companyId: company.id,
    actorType: ActorType.USER,
    actorId: input.createdByUserId ?? null,
    action: 'integration_token_created',
    entityType: 'integration_api_token',
    entityId: record.id,
    after: {
      name: record.name,
      tokenPrefix: record.tokenPrefix,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
    },
  });

  return {
    ...serializeIntegrationApiToken(record),
    token: issued.token,
  };
}

export async function revokeIntegrationApiToken(companySlug: string, id: string) {
  const company = await getCompanyBySlugOrThrow(companySlug);
  const existing = await prisma.integrationApiToken.findFirst({
    where: {
      id,
      companyId: company.id,
    },
    include: {
      company: true,
    },
  });

  if (!existing) {
    throw new ApiError(404, 'integration_token_not_found', 'Integration API token not found.');
  }

  const revokedAt = existing.revokedAt ?? new Date();
  const updated = await prisma.integrationApiToken.update({
    where: {
      id: existing.id,
    },
    data: {
      revokedAt,
    },
    include: {
      company: true,
    },
  });

  await writeAuditLog({
    companyId: company.id,
    actorType: ActorType.USER,
    action: 'integration_token_revoked',
    entityType: 'integration_api_token',
    entityId: updated.id,
    before: {
      revokedAt: existing.revokedAt,
    },
    after: {
      revokedAt: updated.revokedAt,
    },
    metadata: {
      tokenPrefix: updated.tokenPrefix,
      scopes: updated.scopes,
    },
  });

  return serializeIntegrationApiToken(updated);
}

export async function resolveIntegrationTokenOrThrow(rawToken: string): Promise<AuthenticatedIntegrationToken> {
  const parsed = parseIntegrationToken(rawToken);
  if (!parsed) {
    throw new ApiError(401, 'integration_token_invalid', 'Integration bearer token is invalid.');
  }

  const record = await prisma.integrationApiToken.findUnique({
    where: {
      tokenPrefix: parsed.tokenPrefix,
    },
    include: {
      company: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  });

  if (!record) {
    throw new ApiError(401, 'integration_token_invalid', 'Integration bearer token is invalid.');
  }

  if (record.revokedAt || (record.expiresAt && record.expiresAt <= new Date())) {
    throw new ApiError(401, 'integration_token_inactive', 'Integration bearer token is expired or revoked.');
  }

  const providedHash = hashIntegrationTokenSecret(parsed.secret);
  if (!compareTokenHashes(providedHash, record.tokenHash)) {
    throw new ApiError(401, 'integration_token_invalid', 'Integration bearer token is invalid.');
  }

  return {
    id: record.id,
    companyId: record.companyId,
    companySlug: record.company.slug,
    tokenPrefix: record.tokenPrefix,
    scopes: normalizeScopes(record.scopes),
  };
}

export async function markIntegrationTokenUsed(id: string) {
  await prisma.integrationApiToken.update({
    where: {
      id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });
}
