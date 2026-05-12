import { z } from 'zod';

import { currencyValues } from '../constants/statuses';
import { localizedNumberField, optionalNullableField } from './common';

export const validationContextSchema = z.object({
  source: z.enum(['openpos', 'whatsapp', 'api', 'operator', 'system']).default('api'),
  orderNumber: optionalNullableField(z.string().trim().min(1).max(120)),
  cashierId: optionalNullableField(z.string().trim().min(1).max(120)),
  cashierName: optionalNullableField(z.string().trim().min(1).max(160)),
  terminalId: optionalNullableField(z.string().trim().min(1).max(120)),
  store: optionalNullableField(z.string().trim().min(1).max(160)),
  externalRequestId: optionalNullableField(z.string().trim().min(3).max(180)),
  validatorPhone: optionalNullableField(z.string().trim().min(6).max(40)),
});

export const createManualVerificationSchema = z.object({
  referenciaEsperada: optionalNullableField(z.string().trim().min(3).max(120)),
  montoEsperado: localizedNumberField(z.number().positive()),
  moneda: z.enum(currencyValues).default('USD'),
  fechaOperacion: z.string().datetime(),
  toleranciaMinutos: z.coerce.number().int().min(5).max(1440).default(180),
  bancoEsperado: optionalNullableField(z.string().trim().min(2).max(120)),
  cuentaDestinoUltimos4: optionalNullableField(z.string().trim().regex(/^\d{4}$/)),
  nombreClienteOpcional: optionalNullableField(z.string().trim().max(120)),
  notas: optionalNullableField(z.string().trim().max(500)),
  validationContext: validationContextSchema.optional(),
});

export const captureExtractionMethodValues = ['zelle', 'binance', 'pago_movil', 'transferencia_directa'] as const;

export const captureExtractionSchema = z.object({
  method: z.enum(captureExtractionMethodValues),
  ledgerMethod: z.enum(captureExtractionMethodValues).optional(),
  orderNumber: optionalNullableField(z.string().trim().min(1).max(120)),
  amount: optionalNullableField(localizedNumberField(z.number().positive())),
  currency: z.enum(currencyValues).default('USD'),
  paymentDate: optionalNullableField(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)),
  imageDataUrl: z
    .string()
    .trim()
    .regex(/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\r\n]+$/i)
    .max(7_500_000),
  sourceMeta: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
});

export type CreateManualVerificationInput = z.infer<typeof createManualVerificationSchema>;
export type ValidationContextInput = z.infer<typeof validationContextSchema>;
export type CaptureExtractionInput = z.infer<typeof captureExtractionSchema>;
export type CaptureExtractionMethod = (typeof captureExtractionMethodValues)[number];
