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
  } catch {}

  const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim()) as T;
    } catch {}
  }

  const objectMatch = value.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]) as T;
    } catch {}
  }

  return null;
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
    response_format: {
      type: 'json_object',
    },
    messages: [
      {
        role: 'system',
        content:
          'Devuelve solo JSON valido. Considera como comprobante valido una captura real, un recorte, una captura reenviada por WhatsApp, un correo renderizado o una pantalla bancaria simple si muestra evidencia plausible de una transferencia. No exijas logos perfectos ni diseño formal; si ves datos de pago creibles, extraelos con menor confianza en vez de rechazar por completo.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Responde con este JSON exacto: {"isTransferProof":boolean,"reference":string|null,"amount":number|null,"currency":"USD"|"VES"|"EUR"|"COP"|null,"date":"YYYY-MM-DD"|null,"time":"HH:mm"|null,"bank":string|null,"confidence":number}. Marca isTransferProof=true si la imagen parece contener evidencia razonable de transferencia o pago aunque este recortada, reenviada, comprimida o parcialmente visible. Si faltan campos, deja null solo en los que no se vean. Usa isTransferProof=false solo cuando claramente no parezca un comprobante o captura de pago.',
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
      rawText,
      failureReason: 'invalid_json',
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
    rawText,
    failureReason: parsed.isTransferProof ? undefined : 'not_transfer_proof',
  };
}
