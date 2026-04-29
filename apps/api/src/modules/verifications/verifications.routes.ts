import { Router } from 'express';
import {
  companySlugParamSchema,
  createManualVerificationSchema,
  idParamSchema,
  patchActionNoteSchema,
  paymentProviderVerificationSchema,
} from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import { requireCompanyIntegrationScope } from '../../middleware/integration-auth';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import {
  authorizeBinanceVerification,
  authorizePagoMovilVerification,
  authorizeTransferenciaDirectaVerification,
  authorizeVerification,
  confirmVerification,
  createManualPagoMovilVerification,
  createManualTransferenciaDirectaVerification,
  createManualBinanceVerification,
  createManualVerification,
  getVerificationById,
  listVerifications,
  lookupBinanceVerification,
  lookupPagoMovilVerification,
  lookupTransferenciaDirectaVerification,
  lookupVerification,
  operatorLookupPagoMovilVerification,
  operatorLookupTransferenciaDirectaVerification,
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
  '/verifications/binance/lookup',
  validateRequest({ body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await lookupBinanceVerification(DEFAULT_COMPANY_SLUG, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/binance/lookup',
  validateRequest({ params: companySlugParamSchema, body: createManualVerificationSchema }),
  requireCompanyIntegrationScope('verifications:lookup'),
  asyncHandler(async (req, res) => {
    res.json(await lookupBinanceVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/binance/operator-lookup',
  validateRequest({ params: companySlugParamSchema, body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await lookupBinanceVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/pago-movil/lookup',
  validateRequest({ params: companySlugParamSchema, body: paymentProviderVerificationSchema }),
  requireCompanyIntegrationScope('verifications:lookup'),
  asyncHandler(async (req, res) => {
    res.json(await lookupPagoMovilVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/pago-movil/operator-lookup',
  validateRequest({ params: companySlugParamSchema, body: paymentProviderVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await operatorLookupPagoMovilVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/transferencia-directa/lookup',
  validateRequest({ params: companySlugParamSchema, body: paymentProviderVerificationSchema }),
  requireCompanyIntegrationScope('verifications:lookup'),
  asyncHandler(async (req, res) => {
    res.json(await lookupTransferenciaDirectaVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/transferencia-directa/operator-lookup',
  validateRequest({ params: companySlugParamSchema, body: paymentProviderVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await operatorLookupTransferenciaDirectaVerification(req.params.companySlug, req.body));
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
  requireCompanyIntegrationScope('verifications:lookup'),
  asyncHandler(async (req, res) => {
    res.json(await lookupVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/operator-lookup',
  validateRequest({ params: companySlugParamSchema, body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await lookupVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/verifications/binance/authorize',
  validateRequest({ body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await authorizeBinanceVerification(DEFAULT_COMPANY_SLUG, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/binance/authorize',
  validateRequest({ params: companySlugParamSchema, body: createManualVerificationSchema }),
  requireCompanyIntegrationScope('verifications:authorize'),
  asyncHandler(async (req, res) => {
    res.json(await authorizeBinanceVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/pago-movil/authorize',
  validateRequest({ params: companySlugParamSchema, body: paymentProviderVerificationSchema }),
  requireCompanyIntegrationScope('verifications:authorize'),
  asyncHandler(async (req, res) => {
    res.json(await authorizePagoMovilVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/transferencia-directa/authorize',
  validateRequest({ params: companySlugParamSchema, body: paymentProviderVerificationSchema }),
  requireCompanyIntegrationScope('verifications:authorize'),
  asyncHandler(async (req, res) => {
    res.json(await authorizeTransferenciaDirectaVerification(req.params.companySlug, req.body));
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
  requireCompanyIntegrationScope('verifications:authorize'),
  asyncHandler(async (req, res) => {
    res.json(await authorizeVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/verifications/binance/manual',
  validateRequest({ body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createManualBinanceVerification(DEFAULT_COMPANY_SLUG, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/binance/manual',
  validateRequest({ params: companySlugParamSchema, body: createManualVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createManualBinanceVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/pago-movil/manual',
  validateRequest({ params: companySlugParamSchema, body: paymentProviderVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createManualPagoMovilVerification(req.params.companySlug, req.body));
  }),
);

verificationsRouter.post(
  '/companies/:companySlug/verifications/transferencia-directa/manual',
  validateRequest({ params: companySlugParamSchema, body: paymentProviderVerificationSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createManualTransferenciaDirectaVerification(req.params.companySlug, req.body));
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
