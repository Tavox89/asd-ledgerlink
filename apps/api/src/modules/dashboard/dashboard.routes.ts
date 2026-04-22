import { Router } from 'express';
import { companySlugParamSchema } from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import { getDashboardSummary } from './dashboard.service';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/dashboard/summary',
  asyncHandler(async (_req, res) => {
    res.json(await getDashboardSummary(DEFAULT_COMPANY_SLUG));
  }),
);

dashboardRouter.get(
  '/companies/:companySlug/dashboard/summary',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getDashboardSummary(req.params.companySlug));
  }),
);
