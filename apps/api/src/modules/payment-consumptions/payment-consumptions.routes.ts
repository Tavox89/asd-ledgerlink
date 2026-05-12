import { Router } from 'express';
import { z } from 'zod';

import { companySlugParamSchema, idParamSchema } from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import {
  listPaymentConsumptions,
  releasePaymentConsumption,
} from './payment-consumptions.service';

const paymentConsumptionQuerySchema = z.object({
  method: z.enum(['zelle', 'binance', 'pago_movil', 'transferencia_directa']).optional(),
  status: z.enum(['active', 'released']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const releasePaymentConsumptionSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  releasedBy: z.string().trim().max(160).optional().nullable(),
});

export const paymentConsumptionsRouter = Router();

paymentConsumptionsRouter.get(
  '/companies/:companySlug/payments/consumptions',
  validateRequest({ params: companySlugParamSchema, query: paymentConsumptionQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await listPaymentConsumptions(req.params.companySlug, {
        method: req.query.method,
        status: req.query.status,
        page: req.query.page,
        pageSize: req.query.pageSize,
      }),
    );
  }),
);

paymentConsumptionsRouter.post(
  '/companies/:companySlug/payments/consumptions/:id/release',
  validateRequest({
    params: companySlugParamSchema.merge(idParamSchema),
    body: releasePaymentConsumptionSchema,
  }),
  asyncHandler(async (req, res) => {
    res.json(await releasePaymentConsumption(req.params.companySlug, req.params.id, req.body));
  }),
);
