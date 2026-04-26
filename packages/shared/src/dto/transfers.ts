import { z } from 'zod';

import { currencyValues, evidenceStatusValues } from '../constants/statuses';
import { localizedNumberField, optionalNullableField } from './common';

export const createExpectedTransferSchema = z.object({
  referenciaEsperada: z.string().trim().min(3).max(120),
  montoEsperado: localizedNumberField(z.number().positive()),
  moneda: z.enum(currencyValues),
  bancoEsperado: z.string().trim().min(2).max(120),
  fechaEsperadaDesde: z.string().datetime(),
  fechaEsperadaHasta: z.string().datetime(),
  cuentaDestinoUltimos4: optionalNullableField(z.string().trim().regex(/^\d{4}$/)),
  nombreClienteOpcional: optionalNullableField(z.string().trim().max(120)),
  notas: optionalNullableField(z.string().trim().max(500)),
});

export const updateExpectedTransferSchema = createExpectedTransferSchema.partial().extend({
  status: z.enum(evidenceStatusValues).optional(),
});

export type CreateExpectedTransferInput = z.infer<typeof createExpectedTransferSchema>;
export type UpdateExpectedTransferInput = z.infer<typeof updateExpectedTransferSchema>;
