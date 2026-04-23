import { z } from 'zod';

import { currencyValues } from '../constants/statuses';
import { optionalNullableField } from './common';

export const createManualVerificationSchema = z.object({
  referenciaEsperada: optionalNullableField(z.string().trim().min(3).max(120)),
  montoEsperado: z.coerce.number().positive(),
  moneda: z.enum(currencyValues).default('USD'),
  fechaOperacion: z.string().datetime(),
  toleranciaMinutos: z.coerce.number().int().min(5).max(1440).default(180),
  bancoEsperado: optionalNullableField(z.string().trim().min(2).max(120)),
  cuentaDestinoUltimos4: optionalNullableField(z.string().trim().regex(/^\d{4}$/)),
  nombreClienteOpcional: optionalNullableField(z.string().trim().max(120)),
  notas: optionalNullableField(z.string().trim().max(500)),
});

export type CreateManualVerificationInput = z.infer<typeof createManualVerificationSchema>;
