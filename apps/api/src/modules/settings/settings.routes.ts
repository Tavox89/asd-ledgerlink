import { Router } from 'express';
import {
  companySlugParamSchema,
  createAllowedBankSenderSchema,
  idParamSchema,
  updateAllowedBankSenderSchema,
} from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import {
  createAllowedBankSender,
  listAllowedBankSenders,
  updateAllowedBankSender,
} from './settings.service';

export const settingsRouter = Router();

settingsRouter.get(
  '/settings/bank-senders',
  asyncHandler(async (_req, res) => {
    res.json(await listAllowedBankSenders(DEFAULT_COMPANY_SLUG));
  }),
);

settingsRouter.get(
  '/companies/:companySlug/settings/bank-senders',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await listAllowedBankSenders(req.params.companySlug));
  }),
);

settingsRouter.post(
  '/settings/bank-senders',
  validateRequest({ body: createAllowedBankSenderSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createAllowedBankSender(DEFAULT_COMPANY_SLUG, req.body));
  }),
);

settingsRouter.post(
  '/companies/:companySlug/settings/bank-senders',
  validateRequest({ params: companySlugParamSchema, body: createAllowedBankSenderSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createAllowedBankSender(req.params.companySlug, req.body));
  }),
);

settingsRouter.patch(
  '/settings/bank-senders/:id',
  validateRequest({ params: idParamSchema, body: updateAllowedBankSenderSchema }),
  asyncHandler(async (req, res) => {
    res.json(await updateAllowedBankSender(DEFAULT_COMPANY_SLUG, req.params.id, req.body));
  }),
);

settingsRouter.patch(
  '/companies/:companySlug/settings/bank-senders/:id',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema), body: updateAllowedBankSenderSchema }),
  asyncHandler(async (req, res) => {
    res.json(await updateAllowedBankSender(req.params.companySlug, req.params.id, req.body));
  }),
);
