import { z } from 'zod';

function emptyStringToNull(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? null : value;
}

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const companySlugParamSchema = z.object({
  companySlug: z.string().trim().min(1).max(120),
});

export const patchActionNoteSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export function optionalNullableField<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(emptyStringToNull, schema.nullable().optional());
}
