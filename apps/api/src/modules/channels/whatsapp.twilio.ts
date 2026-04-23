import type { Request } from 'express';
import twilio from 'twilio';

import { env } from '../../config/env';
import { normalizeWhatsAppPhone } from './whatsapp.helpers';

function normalizeMessagingServiceSid(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return /^MG[0-9a-fA-F]{32}$/.test(trimmed) ? trimmed : null;
}

function formatWhatsAppAddress(value?: string | null) {
  const normalized = normalizeWhatsAppPhone(value);
  return normalized ? `whatsapp:${normalized}` : null;
}

export function validateTwilioRequest(req: Request) {
  if (!env.TWILIO_VALIDATE_SIGNATURE) {
    return true;
  }

  if (!env.TWILIO_AUTH_TOKEN) {
    return false;
  }

  const signature = req.header('x-twilio-signature');
  if (!signature) {
    return false;
  }

  const protocol = req.header('x-forwarded-proto') ?? req.protocol;
  const host = req.header('x-forwarded-host') ?? req.get('host');
  const url = `${protocol}://${host}${req.originalUrl}`;

  return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, req.body);
}

export async function sendTwilioWhatsAppReply(input: {
  toPhoneNumber: string;
  body: string;
  channelPhoneNumber?: string | null;
  messagingServiceSid?: string | null;
}) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error('twilio_credentials_missing');
  }

  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  const to = formatWhatsAppAddress(input.toPhoneNumber);
  const from = formatWhatsAppAddress(input.channelPhoneNumber ?? env.TWILIO_WHATSAPP_FROM);
  const messagingServiceSid =
    normalizeMessagingServiceSid(input.messagingServiceSid) ||
    normalizeMessagingServiceSid(env.TWILIO_SERVICE_SID) ||
    null;

  if (!to) {
    throw new Error('twilio_reply_to_missing');
  }

  if (!messagingServiceSid && !from) {
    throw new Error('twilio_reply_channel_missing');
  }

  const message = await client.messages.create({
    body: input.body,
    to,
    ...(messagingServiceSid ? { messagingServiceSid } : { from: from! }),
  });

  return {
    sid: message.sid,
    from: message.from ?? from,
    to: message.to ?? to,
    status: message.status ?? null,
  };
}
