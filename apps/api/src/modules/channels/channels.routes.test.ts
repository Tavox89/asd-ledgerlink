import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../../middleware/error-handler';

const buildWebhookReplyXml = vi.fn();
const listWhatsAppVerificationAttempts = vi.fn();
const validateTwilioRequest = vi.fn();

vi.mock('./whatsapp.service', () => ({
  buildWebhookReplyXml,
  listWhatsAppVerificationAttempts,
}));

vi.mock('./whatsapp.twilio', () => ({
  validateTwilioRequest,
}));

describe('channels routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes the Twilio webhook through the WhatsApp service using form payloads', async () => {
    const { channelsRouter } = await import('./channels.routes');
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(channelsRouter);
    app.use(errorHandler);

    validateTwilioRequest.mockReturnValue(true);
    buildWebhookReplyXml.mockResolvedValue('<?xml version="1.0" encoding="UTF-8"?><Response><Message>ok</Message></Response>');

    const response = await request(app)
      .post('/channels/whatsapp/twilio/webhook')
      .type('form')
      .send({
        From: 'whatsapp:+584121112233',
        To: 'whatsapp:+10000000000',
        Body: 'hola',
        MessageSid: 'SM123',
        NumMedia: '0',
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/xml');
    await vi.waitFor(() => {
      expect(buildWebhookReplyXml).toHaveBeenCalledWith(
        expect.objectContaining({
          From: 'whatsapp:+584121112233',
          Body: 'hola',
        }),
      );
    });
  });

  it('lists persisted WhatsApp attempts', async () => {
    const { channelsRouter } = await import('./channels.routes');
    const app = express();
    app.use(express.json());
    app.use(channelsRouter);
    app.use(errorHandler);

    listWhatsAppVerificationAttempts.mockResolvedValue({
      items: [{ id: 'attempt-1', status: 'authorized' }],
      pagination: { page: 1, pageSize: 20, total: 1 },
    });

    const response = await request(app).get('/channels/whatsapp/attempts?page=1&pageSize=20');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      items: [{ id: 'attempt-1', status: 'authorized' }],
      pagination: { page: 1, pageSize: 20, total: 1 },
    });
  });
});
