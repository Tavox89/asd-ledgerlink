import { z } from 'zod';

import { optionalNullableField } from './common';

const phoneSchema = z.string().trim().min(5).max(40);
const allowedTestNumbersSchema = z.array(phoneSchema).max(50).default([]);

export const createCompanyProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  notes: optionalNullableField(z.string().trim().max(500)),
  isActive: z.boolean().default(true),
  whatsAppPhoneNumber: optionalNullableField(phoneSchema),
  messagingServiceSid: optionalNullableField(z.string().trim().min(10).max(64)),
  allowedTestNumbers: allowedTestNumbersSchema.optional(),
  whatsAppChannelActive: z.boolean().default(true),
});

export const updateCompanyProfileSchema = createCompanyProfileSchema
  .omit({ slug: true })
  .partial()
  .extend({
    allowedTestNumbers: allowedTestNumbersSchema.optional(),
  });

export type CreateCompanyProfileInput = z.infer<typeof createCompanyProfileSchema>;
export type UpdateCompanyProfileInput = z.infer<typeof updateCompanyProfileSchema>;
