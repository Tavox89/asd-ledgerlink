import { z } from 'zod';

import { currencyValues } from '../constants/statuses';
import { localizedNumberField, optionalNullableField } from './common';

export const paymentProviderValues = ['instapago'] as const;
export const paymentProviderMethodValues = ['pago_movil', 'transferencia_directa'] as const;

const bankCodeSchema = z.string().trim().regex(/^\d{4}$/, 'Debe ser un codigo bancario SUDEBAN de 4 digitos.');
const venezuelanDocumentSchema = z
  .string()
  .trim()
  .regex(/^[VEJPGvejpg]?\d{5,12}$/, 'Debe ser una cedula o RIF venezolano valido.');
const phoneSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().replace(/[\s().-]+/g, '') : value),
  z
    .string()
    .regex(
      /^(?:4\d{9}|04\d{9}|58[24]\d{9}|\+58[24]\d{9}|0058[24]\d{9})$/,
      'Debe ser un telefono venezolano valido. Usa 04121234567 o 00584121234567.',
    ),
);

export const upsertInstapagoConfigSchema = z.object({
  isActive: z.boolean().default(true),
  apiBaseUrl: z.string().trim().url().default('https://merchant.instapago.com/services/api'),
  keyId: optionalNullableField(z.string().trim().min(4).max(160)),
  publicKeyId: optionalNullableField(z.string().trim().min(8).max(240)),
  defaultReceiptBank: bankCodeSchema,
  defaultOriginBank: optionalNullableField(bankCodeSchema),
});

export const paymentProviderVerificationSchema = z
  .object({
    referenciaEsperada: z.string().trim().min(4).max(120),
    montoEsperado: localizedNumberField(z.number().positive()),
    moneda: z.enum(currencyValues).default('VES'),
    fechaPago: optionalNullableField(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)),
    fechaOperacion: optionalNullableField(z.string().datetime()),
    bancoOrigen: optionalNullableField(bankCodeSchema),
    bancoDestino: optionalNullableField(bankCodeSchema),
    cedulaCliente: optionalNullableField(venezuelanDocumentSchema),
    telefonoCliente: optionalNullableField(phoneSchema),
    nombreClienteOpcional: optionalNullableField(z.string().trim().max(120)),
    notas: optionalNullableField(z.string().trim().max(500)),
    externalRequestId: optionalNullableField(z.string().trim().min(3).max(160)),
  })
  .refine((input) => Boolean(input.fechaPago || input.fechaOperacion), {
    message: 'Debe informar fechaPago o fechaOperacion.',
    path: ['fechaPago'],
  });

export type PaymentProvider = (typeof paymentProviderValues)[number];
export type PaymentProviderMethod = (typeof paymentProviderMethodValues)[number];
export type UpsertInstapagoConfigInput = z.infer<typeof upsertInstapagoConfigSchema>;
export type PaymentProviderVerificationInput = z.infer<typeof paymentProviderVerificationSchema>;
