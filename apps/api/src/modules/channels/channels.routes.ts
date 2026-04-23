import { Router } from 'express';
import { z } from 'zod';
import { companySlugParamSchema, paginationQuerySchema } from '@ledgerlink/shared';

import { asyncHandler, validateRequest } from '../../lib/http';
import { DEFAULT_COMPANY_SLUG } from '../companies/companies.service';
import { buildWebhookReplyXml, listWhatsAppVerificationAttempts } from './whatsapp.service';
import { buildTwimlResponse, type TwilioWebhookPayload } from './whatsapp.helpers';
import { validateTwilioRequest } from './whatsapp.twilio';

const twilioWebhookBodySchema = z
  .object({
    From: z.string().optional(),
    To: z.string().optional(),
    Body: z.string().optional(),
    MessageSid: z.string().optional(),
    NumMedia: z.string().optional(),
  })
  .passthrough();

export const channelsRouter = Router();

channelsRouter.get(
  '/channels/whatsapp/attempts',
  validateRequest({ query: paginationQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = paginationQuerySchema.parse(req.query);
    res.json(await listWhatsAppVerificationAttempts(DEFAULT_COMPANY_SLUG, query.page, query.pageSize));
  }),
);

channelsRouter.get(
  '/companies/:companySlug/channels/whatsapp/attempts',
  validateRequest({ params: companySlugParamSchema, query: paginationQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = paginationQuerySchema.parse(req.query);
    res.json(await listWhatsAppVerificationAttempts(req.params.companySlug, query.page, query.pageSize));
  }),
);

channelsRouter.get('/channels/whatsapp/twilio/webhook', (_req, res) => {
  res.type('text/plain').send('ok');
});

channelsRouter.head('/channels/whatsapp/twilio/webhook', (_req, res) => {
  res.sendStatus(200);
});

channelsRouter.post('/channels/whatsapp/twilio/webhook', async (req, res) => {
  const body = twilioWebhookBodySchema.parse(req.body) as TwilioWebhookPayload;

  if (!validateTwilioRequest(req)) {
    return res.status(403).type('text/plain').send('forbidden');
  }

  // Acknowledge Twilio immediately and finish OCR/verification asynchronously.
  // This keeps media-heavy requests from failing at the webhook layer before the
  // outbound WhatsApp reply can be sent through the Twilio API.
  queueMicrotask(() => {
    void buildWebhookReplyXml(body);
  });

  return res.type('text/xml').send(buildTwimlResponse());
});
