import { z } from 'zod';

import { optionalNullableField } from './common';

export const integrationTokenScopeValues = [
  'verifications:authorize',
  'verifications:lookup',
] as const;

export const integrationTokenScopeSchema = z.enum(integrationTokenScopeValues);

export const createIntegrationApiTokenSchema = z.object({
  name: z.string().trim().min(2).max(120),
  scopes: z.array(integrationTokenScopeSchema).min(1).max(integrationTokenScopeValues.length),
  expiresAt: optionalNullableField(z.string().datetime()),
  createdByUserId: optionalNullableField(z.string().trim().min(1).max(120)),
});

export type IntegrationTokenScope = z.infer<typeof integrationTokenScopeSchema>;
export type CreateIntegrationApiTokenInput = z.infer<typeof createIntegrationApiTokenSchema>;
