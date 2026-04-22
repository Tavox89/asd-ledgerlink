import { Router } from 'express';
import {
  companySlugParamSchema,
  createIntegrationApiTokenSchema,
  idParamSchema,
} from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import {
  createIntegrationApiToken,
  listIntegrationApiTokens,
  revokeIntegrationApiToken,
} from './integration-tokens.service';

export const integrationTokensRouter = Router();

integrationTokensRouter.get(
  '/companies/:companySlug/integration-tokens',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await listIntegrationApiTokens(req.params.companySlug));
  }),
);

integrationTokensRouter.post(
  '/companies/:companySlug/integration-tokens',
  validateRequest({ params: companySlugParamSchema, body: createIntegrationApiTokenSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createIntegrationApiToken(req.params.companySlug, req.body));
  }),
);

integrationTokensRouter.post(
  '/companies/:companySlug/integration-tokens/:id/revoke',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema) }),
  asyncHandler(async (req, res) => {
    res.json(await revokeIntegrationApiToken(req.params.companySlug, req.params.id));
  }),
);
