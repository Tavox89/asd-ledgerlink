import { z } from 'zod';

import { optionalNullableField } from './common';

export const createAllowedBankSenderSchema = z.object({
  bankName: z.string().trim().min(2).max(120),
  senderEmail: optionalNullableField(z.string().trim().email()),
  senderDomain: optionalNullableField(z.string().trim().min(3).max(190)),
  replyToPattern: optionalNullableField(z.string().trim().max(190)),
  returnPathPattern: optionalNullableField(z.string().trim().max(190)),
  messageIdPattern: optionalNullableField(z.string().trim().max(190)),
  notes: optionalNullableField(z.string().trim().max(500)),
  isActive: z.boolean().default(true),
});

export const updateAllowedBankSenderSchema = createAllowedBankSenderSchema.partial();

export type CreateAllowedBankSenderInput = z.infer<typeof createAllowedBankSenderSchema>;
export type UpdateAllowedBankSenderInput = z.infer<typeof updateAllowedBankSenderSchema>;
