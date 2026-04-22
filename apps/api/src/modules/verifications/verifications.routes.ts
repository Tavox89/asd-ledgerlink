import { Router } from 'express';
import {
  companySlugParamSchema,
  createManualVerificationSchema,
  idParamSchema,
  patchActionNoteSchema,
} from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import {
  authorizeVerification,
  confirmVerification,
  createManualVerification,
  getVerificationById,
  listVerifications,
  lookupVerification,
  rejectVerification,
} from './verifications.service';

export const verificationsRouter = Router();

verificationsRouter.get(
  '/verifications',
  asyncHandler(async (_req, res) => {
    res.json(await listVerifications(DEFAULT_COMPANY_SLUG));
  }),
);

verificationsRouter.get(
  '/companies/:companySlug/verifications',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await listVerifications(req.params.companySlug));
  }),
);

verificationsRouter.post(
  '/verifications/lookup',
  validateRequest({ body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await lookupVerification(DEFAULT_COMPANY_SLUG, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/lookup',
  validateRequest({ params: companySlugParamSchema, body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await lookupVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/verifications/authorize',
  validateRequest({ body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await authorizeVerification(DEFAULT_COMPANY_SLUG, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/authorize',
  validateRequest({ params: companySlugParamSchema, body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await authorizeVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/verifications/manual',
  validateRequest({ body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createManualVerification(DEFAULT_COMPANY_SLUG, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/manual',
  validateRequest({ params: companySlugParamSchema, body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createManualVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.get(
  '/verifications/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getVerificationById(DEFAULT_COMPANY_SLUG, req.params.id));
  }),
);

verificationsRouter.get(
  '/companies/:companySlug/verifications/:id',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema) }),
  asyncHandler(async (req, res) => {
    res.json(await getVerificationById(req.params.companySlug, req.params.id));
  }),
);

verificationsRouter.post(
  '/verifications/:id/confirm',
  validateRequest({ params: idParamSchema, body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await confirmVerification(DEFAULT_COMPANY_SLUG, req.params.id, req.body.note));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/:id/confirm',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema), body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await confirmVerification(req.params.companySlug, req.params.id, req.body.note));
  }),
);

verificationsRouter.post(
  '/verifications/:id/reject',
  validateRequest({ params: idParamSchema, body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await rejectVerification(DEFAULT_COMPANY_SLUG, req.params.id, req.body.note));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/:id/reject',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema), body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await rejectVerification(req.params.companySlug, req.params.id, req.body.note));
  }),
);
