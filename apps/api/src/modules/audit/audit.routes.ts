import { Router } from 'express';
import { companySlugParamSchema } from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import { listAuditTrail } from './audit.service';

export const auditRouter = Router();

auditRouter.get(
  '/audit',
  asyncHandler(async (_req, res) => {
    res.json(await listAuditTrail(DEFAULT_COMPANY_SLUG));
  }),
);

auditRouter.get(
  '/companies/:companySlug/audit',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await listAuditTrail(req.params.companySlug));
  }),
);
