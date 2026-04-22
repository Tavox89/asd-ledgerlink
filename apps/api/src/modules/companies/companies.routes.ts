import { Router } from 'express';
import {
  companySlugParamSchema,
  createCompanyProfileSchema,
  updateCompanyProfileSchema,
} from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import {
  createCompanyProfile,
  getCompanyProfile,
  listCompanies,
  updateCompanyProfile,
} from './companies.service';

export const companiesRouter = Router();

companiesRouter.get(
  '/companies',
  asyncHandler(async (_req, res) => {
    res.json(await listCompanies());
  }),
);

companiesRouter.post(
  '/companies',
  validateRequest({ body: createCompanyProfileSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createCompanyProfile(req.body));
  }),
);

companiesRouter.get(
  '/companies/:companySlug',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getCompanyProfile(req.params.companySlug));
  }),
);

companiesRouter.patch(
  '/companies/:companySlug',
  validateRequest({ params: companySlugParamSchema, body: updateCompanyProfileSchema }),
  asyncHandler(async (req, res) => {
    res.json(await updateCompanyProfile(req.params.companySlug, req.body));
  }),
);
