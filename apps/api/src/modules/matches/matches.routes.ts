import { Router } from 'express';
import {
  companySlugParamSchema,
  idParamSchema,
  patchActionNoteSchema,
  reviewMatchSchema,
} from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import {
  getMatchById,
  listMatches,
  preconfirmMatch,
  rejectMatch,
  reviewMatch,
} from './matching.service';

export const matchesRouter = Router();

matchesRouter.get(
  '/matches',
  asyncHandler(async (_req, res) => {
    res.json(await listMatches(DEFAULT_COMPANY_SLUG));
  }),
);

matchesRouter.get(
  '/companies/:companySlug/matches',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await listMatches(req.params.companySlug));
  }),
);

matchesRouter.get(
  '/matches/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getMatchById(DEFAULT_COMPANY_SLUG, req.params.id));
  }),
);

matchesRouter.get(
  '/companies/:companySlug/matches/:id',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema) }),
  asyncHandler(async (req, res) => {
    res.json(await getMatchById(req.params.companySlug, req.params.id));
  }),
);

matchesRouter.post(
  '/matches/:id/preconfirm',
  validateRequest({ params: idParamSchema, body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await preconfirmMatch(DEFAULT_COMPANY_SLUG, req.params.id, req.body.note));
  }),
);

matchesRouter.post(
  '/companies/:companySlug/matches/:id/preconfirm',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema), body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await preconfirmMatch(req.params.companySlug, req.params.id, req.body.note));
  }),
);

matchesRouter.post(
  '/matches/:id/review',
  validateRequest({ params: idParamSchema, body: reviewMatchSchema }),
  asyncHandler(async (req, res) => {
    res.json(await reviewMatch(DEFAULT_COMPANY_SLUG, req.params.id, req.body));
  }),
);

matchesRouter.post(
  '/companies/:companySlug/matches/:id/review',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema), body: reviewMatchSchema }),
  asyncHandler(async (req, res) => {
    res.json(await reviewMatch(req.params.companySlug, req.params.id, req.body));
  }),
);

matchesRouter.post(
  '/matches/:id/reject',
  validateRequest({ params: idParamSchema, body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await rejectMatch(DEFAULT_COMPANY_SLUG, req.params.id, req.body.note));
  }),
);

matchesRouter.post(
  '/companies/:companySlug/matches/:id/reject',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema), body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await rejectMatch(req.params.companySlug, req.params.id, req.body.note));
  }),
);
