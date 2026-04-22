import { Router } from 'express';
import { companySlugParamSchema } from '@ledgerlink/shared';

import { env } from '../../config/env';
import { ApiError, asyncHandler, validateRequest } from '../../lib/http';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import { getGoogleAuthStartUrl, handleGoogleOAuthCallback } from '../gmail/gmail.service';

export const authRouter = Router();

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
    res.redirect(`${env.WEB_APP_URL}/companies/${companySlug}/settings/gmail?status=connected`);
  }),
);
