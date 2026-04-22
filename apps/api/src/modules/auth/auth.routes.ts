import { Router, type Request } from 'express';
import { companySlugParamSchema } from '@ledgerlink/shared';

import { env } from '../../config/env';
import { ApiError, asyncHandler, validateRequest } from '../../lib/http';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import { getGoogleAuthStartUrl, handleGoogleOAuthCallback } from '../gmail/gmail.service';

export const authRouter = Router();

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLoopbackHostname(hostname: string) {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

function getForwardedHeaderValue(value: string | undefined) {
  return value?.split(',')[0]?.trim() ?? '';
}

function resolvePostAuthWebOrigin(req: Request) {
  const configuredOrigin = new URL(env.WEB_APP_URL);
  if (!isLoopbackHostname(configuredOrigin.hostname)) {
    return configuredOrigin.origin;
  }

  const requestProtocol = getForwardedHeaderValue(req.header('x-forwarded-proto')) || req.protocol;
  const requestHost = getForwardedHeaderValue(req.header('x-forwarded-host')) || req.get('host');
  if (!requestHost) {
    return configuredOrigin.origin;
  }

  try {
    const requestOrigin = new URL(`${requestProtocol}://${requestHost}`);
    if (isLoopbackHostname(requestOrigin.hostname)) {
      return configuredOrigin.origin;
    }

    return requestOrigin.origin;
  } catch {
    return configuredOrigin.origin;
  }
}

authRouter.get(
  '/auth/google/start',
  asyncHandler(async (_req, res) => {
    res.redirect(getGoogleAuthStartUrl(DEFAULT_COMPANY_SLUG));
  }),
);

authRouter.get(
  '/companies/:companySlug/auth/google/start',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.redirect(getGoogleAuthStartUrl(req.params.companySlug));
  }),
);

authRouter.get(
  '/auth/google/callback',
  asyncHandler(async (req, res) => {
    const code = String(req.query.code ?? '');
    const companySlug = String(req.query.state ?? DEFAULT_COMPANY_SLUG);
    if (!code) {
      throw new ApiError(400, 'missing_google_code', 'Google OAuth callback did not include a code.');
    }
    await handleGoogleOAuthCallback(code, companySlug);
    res.redirect(`${resolvePostAuthWebOrigin(req)}/companies/${companySlug}/settings/gmail?status=connected`);
  }),
);
