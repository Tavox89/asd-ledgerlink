import { Router } from 'express';
import { companySlugParamSchema, upsertInstapagoConfigSchema } from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import { getInstapagoConfig, upsertInstapagoConfig } from './payment-providers.service';

export const paymentProvidersRouter = Router();

paymentProvidersRouter.get(
  '/companies/:companySlug/payment-providers/instapago',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getInstapagoConfig(req.params.companySlug));
  }),
);

paymentProvidersRouter.put(
  '/companies/:companySlug/payment-providers/instapago',
  validateRequest({ params: companySlugParamSchema, body: upsertInstapagoConfigSchema }),
  asyncHandler(async (req, res) => {
    res.json(await upsertInstapagoConfig(req.params.companySlug, req.body));
  }),
);
