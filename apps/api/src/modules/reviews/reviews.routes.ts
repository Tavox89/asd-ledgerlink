import { Router } from 'express';
import { companySlugParamSchema } from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import { listManualReviews } from './reviews.service';

export const reviewsRouter = Router();

reviewsRouter.get(
  '/reviews',
  asyncHandler(async (_req, res) => {
    res.json(await listManualReviews(DEFAULT_COMPANY_SLUG));
  }),
);

reviewsRouter.get(
  '/companies/:companySlug/reviews',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await listManualReviews(req.params.companySlug));
  }),
);
