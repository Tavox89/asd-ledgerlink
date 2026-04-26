import { z } from 'zod';

export const gmailMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  gmailAccountId: z.string().trim().min(1).optional(),
  processingStatus: z
    .enum(['received', 'parsed', 'matched', 'needs_review', 'ignored', 'rejected'])
    .optional(),
});

export const gmailPullSchema = z.object({
  maxMessages: z.coerce.number().int().min(1).max(50).default(10),
});

export const gmailSyncRecentSchema = z.object({
  maxMessages: z.coerce.number().int().min(1).max(50).default(10),
  query: z.string().trim().min(1).max(200).optional(),
});

export const gmailAccountStatusSchema = z.object({
  isActive: z.boolean(),
});

export type GmailMessagesQuery = z.infer<typeof gmailMessagesQuerySchema>;
export type GmailPullInput = z.infer<typeof gmailPullSchema>;
export type GmailSyncRecentInput = z.infer<typeof gmailSyncRecentSchema>;
export type GmailAccountStatusInput = z.infer<typeof gmailAccountStatusSchema>;
