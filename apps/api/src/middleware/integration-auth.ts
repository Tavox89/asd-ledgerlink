import type { RequestHandler } from 'express';

import { ApiError, asyncHandler } from '../lib/http';
import {
  markIntegrationTokenUsed,
  resolveIntegrationTokenOrThrow,
  type AuthenticatedIntegrationToken,
} from '../modules/integration-tokens/integration-tokens.service';

declare global {
  namespace Express {
    interface Locals {
      integrationTokenAuth?: AuthenticatedIntegrationToken;
    }
  }
}

function extractBearerToken(headerValue: string | undefined) {
  if (!headerValue) {
    throw new ApiError(401, 'integration_token_missing', 'Integration bearer token is required.');
  }

  const [scheme, ...rest] = headerValue.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || rest.length === 0) {
    throw new ApiError(401, 'integration_token_missing', 'Integration bearer token is required.');
  }

  return rest.join(' ').trim();
}

export function requireCompanyIntegrationScope(scope: string): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const rawToken = extractBearerToken(req.get('authorization') ?? undefined);
    const auth = await resolveIntegrationTokenOrThrow(rawToken);

    if (auth.companySlug !== req.params.companySlug) {
      throw new ApiError(
        403,
        'integration_token_company_mismatch',
        'Integration token does not belong to the requested company.',
      );
    }

    if (!auth.scopes.includes(scope as never)) {
      throw new ApiError(
        403,
        'integration_token_insufficient_scope',
        'Integration token does not have permission for this operation.',
        { requiredScope: scope },
      );
    }

    await markIntegrationTokenUsed(auth.id);
    res.locals.integrationTokenAuth = auth;
    next();
  });
}
