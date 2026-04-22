import { z } from 'zod';

export const reviewMatchSchema = z.object({
  decision: z.enum(['needs_review', 'reject', 'preconfirm']),
  reviewNotes: z.string().trim().min(3).max(500),
});

export const preconfirmMatchSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type ReviewMatchInput = z.infer<typeof reviewMatchSchema>;
export type PreconfirmMatchInput = z.infer<typeof preconfirmMatchSchema>;
