import OpenAI from 'openai';

import { env } from '../../config/env';
import type { CurrencyCode } from '@ledgerlink/shared';

import type { VisionExtractionResult } from './whatsapp.helpers';

function normalizeCurrency(value?: string | null): CurrencyCode | null {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === 'USD' || normalized === 'VES' || normalized === 'EUR' || normalized === 'COP') {
    return normalized;
  }

  return null;
}

function parseJsonObject<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function downloadMedia(url: string) {
  const headers = new Headers();
  if (/api\.twilio\.com/i.test(url) && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    headers.set(
      'Authorization',
      `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
    );
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`twilio_media_download_failed:${response.status}`);
  }

  return {
    contentType: response.headers.get('content-type') ?? 'image/jpeg',
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

export async function extractVerificationFromImage(
  imageUrl: string,
): Promise<VisionExtractionResult | null> {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  const { buffer, contentType } = await downloadMedia(imageUrl);
  const imageDataUri = `data:${contentType};base64,${buffer.toString('base64')}`;

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: env.OPENAI_VISION_MODEL,
    temperature: 0,
    max_tokens: 250,
    messages: [
      {
        role: 'system',
        content:
          'Devuelve solo JSON valido. Extrae datos solo si la imagen parece ser un comprobante o captura de transferencia.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Responde con este JSON exacto: {"isTransferProof":boolean,"reference":string|null,"amount":number|null,"currency":"USD"|"VES"|"EUR"|"COP"|null,"date":"YYYY-MM-DD"|null,"time":"HH:mm"|null,"bank":string|null,"confidence":number}. Si no es comprobante, pon isTransferProof=false y los campos en null.',
          },
          {
            type: 'image_url',
            image_url: {
              url: imageDataUri,
            },
          },
        ],
      },
    ],
  });

  const rawText = completion.choices[0]?.message?.content?.trim() ?? '';
  const parsed = parseJsonObject<{
    isTransferProof?: boolean;
    reference?: string | null;
    amount?: number | null;
    currency?: string | null;
    date?: string | null;
    time?: string | null;
    bank?: string | null;
    confidence?: number | null;
  }>(rawText);

  if (!parsed) {
    return {
      isTransferProof: false,
      reference: null,
      amount: null,
      currency: null,
      date: null,
      time: null,
      bank: null,
      confidence: 0,
    };
  }

  return {
    isTransferProof: Boolean(parsed.isTransferProof),
    reference: parsed.reference?.trim() || null,
    amount: typeof parsed.amount === 'number' ? parsed.amount : null,
    currency: normalizeCurrency(parsed.currency),
    date: parsed.date?.trim() || null,
    time: parsed.time?.trim() || null,
    bank: parsed.bank?.trim() || null,
    confidence:
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(100, parsed.confidence))
        : 0,
  };
}
