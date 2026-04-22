import { Router } from 'express';
import {
  companySlugParamSchema,
  createExpectedTransferSchema,
  idParamSchema,
  patchActionNoteSchema,
  updateExpectedTransferSchema,
} from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import {
  confirmTransfer,
  createTransfer,
  getTransferById,
  listTransfers,
  rejectTransfer,
  updateTransfer,
} from './transfers.service';

export const transfersRouter = Router();

transfersRouter.get(
  '/transfers',
  asyncHandler(async (_req, res) => {
    res.json(await listTransfers(DEFAULT_COMPANY_SLUG));
  }),
);

transfersRouter.get(
  '/companies/:companySlug/transfers',
  validateRequest({ params: companySlugParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await listTransfers(req.params.companySlug));
  }),
);

transfersRouter.post(
  '/transfers',
  validateRequest({ body: createExpectedTransferSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createTransfer(DEFAULT_COMPANY_SLUG, req.body));
  }),
);

transfersRouter.post(
  '/companies/:companySlug/transfers',
  validateRequest({ params: companySlugParamSchema, body: createExpectedTransferSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createTransfer(req.params.companySlug, req.body));
  }),
);

transfersRouter.get(
  '/transfers/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await getTransferById(DEFAULT_COMPANY_SLUG, req.params.id));
  }),
);

transfersRouter.get(
  '/companies/:companySlug/transfers/:id',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema) }),
  asyncHandler(async (req, res) => {
    res.json(await getTransferById(req.params.companySlug, req.params.id));
  }),
);

transfersRouter.patch(
  '/transfers/:id',
  validateRequest({ params: idParamSchema, body: updateExpectedTransferSchema }),
  asyncHandler(async (req, res) => {
    res.json(await updateTransfer(DEFAULT_COMPANY_SLUG, req.params.id, req.body));
  }),
);

transfersRouter.patch(
  '/companies/:companySlug/transfers/:id',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema), body: updateExpectedTransferSchema }),
  asyncHandler(async (req, res) => {
    res.json(await updateTransfer(req.params.companySlug, req.params.id, req.body));
  }),
);

transfersRouter.post(
  '/transfers/:id/confirm',
  validateRequest({ params: idParamSchema, body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await confirmTransfer(DEFAULT_COMPANY_SLUG, req.params.id, req.body.note));
  }),
);

transfersRouter.post(
  '/companies/:companySlug/transfers/:id/confirm',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema), body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await confirmTransfer(req.params.companySlug, req.params.id, req.body.note));
  }),
);

transfersRouter.post(
  '/transfers/:id/reject',
  validateRequest({ params: idParamSchema, body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await rejectTransfer(DEFAULT_COMPANY_SLUG, req.params.id, req.body.note));
  }),
);

transfersRouter.post(
  '/companies/:companySlug/transfers/:id/reject',
  validateRequest({ params: companySlugParamSchema.merge(idParamSchema), body: patchActionNoteSchema }),
  asyncHandler(async (req, res) => {
    res.json(await rejectTransfer(req.params.companySlug, req.params.id, req.body.note));
  }),
);
