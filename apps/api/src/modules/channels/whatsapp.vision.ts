import OpenAI from 'openai';

import { env } from '../../config/env';
import type { CurrencyCode } from '@ledgerlink/shared';
import { dayjs } from '../../lib/dayjs';

import type { VerificationPaymentMethod, VisionExtractionResult } from './whatsapp.helpers';

function normalizeCurrency(value?: string | null): CurrencyCode | null {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === 'USD' || normalized === 'VES' || normalized === 'EUR' || normalized === 'COP') {
    return normalized;
  }

  if (normalized === 'USDT') {
    return 'USD';
  }

  return null;
}

function parseJsonObject<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    // Continue with fenced/embedded JSON recovery below.
  }

  const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim()) as T;
    } catch {
      // Continue with embedded JSON recovery below.
    }
  }

  const objectMatch = value.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]) as T;
    } catch {
      // Return null when no recoverable JSON payload is present.
    }
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

function normalizeRelativeDate(value: string | null | undefined, referenceDate: Date) {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return null;
  }

  if (normalized === 'today' || normalized === 'hoy') {
    return dayjs(referenceDate).format('YYYY-MM-DD');
  }

  if (normalized === 'yesterday' || normalized === 'ayer') {
    return dayjs(referenceDate).subtract(1, 'day').format('YYYY-MM-DD');
  }

  return value?.trim() || null;
}

function methodPrompt(method: VerificationPaymentMethod, referenceDate: Date) {
  const baseJson =
    '{"isTransferProof":boolean,"reference":string|null,"customerName":string|null,"alias":string|null,"amount":number|null,"currency":"USD"|"VES"|"EUR"|"COP"|null,"date":"YYYY-MM-DD"|null,"time":"HH:mm"|null,"bank":string|null,"originBank":string|null,"destinationBank":string|null,"clientId":string|null,"phoneNumber":string|null,"confidence":number}';
  const dateInstruction = `Toma como fecha de referencia ${dayjs(referenceDate).format('YYYY-MM-DD')}. Si la captura dice Today/Hoy, usa esa fecha; si dice Yesterday/Ayer, usa el dia anterior.`;

  switch (method) {
    case 'binance':
      return `Perfil obligatorio: Binance. No autodetectes otro metodo. Responde con este JSON exacto: ${baseJson}. Extrae como reference el ID de orden, order ID, transaction ID o identificador Binance mas especifico visible. Extrae customerName solo si aparece nombre del pagador/remitente; si solo ves alias, correo o cuenta receptora, usa alias y deja customerName=null. Si aparece USDT, normaliza currency a USD. ${dateInstruction}`;
    case 'pago_movil':
      return `Perfil obligatorio: Pago Movil venezolano. No autodetectes otro metodo. Responde con este JSON exacto: ${baseJson}. Extrae referencia, monto VES, fecha de pago, banco origen, banco destino si aparece, cedula/RIF y telefono del cliente si aparecen. Los bancos deben ser codigos de 4 digitos si se ven; si solo ves nombre del banco, dejalo en originBank o destinationBank como texto. ${dateInstruction}`;
    case 'transferencia_directa':
      return `Perfil obligatorio: transferencia bancaria venezolana. No autodetectes otro metodo. Responde con este JSON exacto: ${baseJson}. Extrae referencia, monto VES, fecha de pago, banco origen, banco destino si aparece y cedula/RIF si aparecen. No inventes telefono si no se ve. Los bancos deben ser codigos de 4 digitos si se ven; si solo ves nombre del banco, dejalo como texto. ${dateInstruction}`;
    case 'zelle':
      return `Perfil obligatorio: Zelle. No autodetectes otro metodo. Responde con este JSON exacto: ${baseJson}. Extrae referencia si aparece, nombre del pagador o nombre asociado al pago, monto USD y fecha de llegada o pago. Si la captura muestra "Enrolled as", usa ese nombre completo como customerName. No confundas alias, correo receptor o cuenta destino con el pagador. ${dateInstruction}`;
    default:
      return `Responde con este JSON exacto: ${baseJson}. Si la captura muestra un nombre del pago o destinatario, usa el nombre mas completo visible, por ejemplo el de "Enrolled as". Si la captura es de Binance, customerName debe ser el pagador/remitente si aparece; no uses como customerName el alias, correo o cuenta receptora. Si solo ves alias o correo receptor de Binance, extraelo en alias y deja customerName=null. Si es Pago Movil o transferencia bancaria venezolana, extrae referencia, monto, fecha, banco origen, banco destino, cedula/RIF y telefono si aparecen; los bancos deben ser codigos de 4 digitos si se ven. Si la captura usa USDT, normaliza currency a USD. ${dateInstruction} Marca isTransferProof=true si la imagen parece contener evidencia razonable de transferencia o pago aunque este recortada, reenviada, comprimida o parcialmente visible. Si faltan campos, deja null solo en los que no se vean. Usa isTransferProof=false solo cuando claramente no parezca un comprobante o captura de pago.`;
  }
}

export async function extractVerificationFromImageDataUri(input: {
  imageDataUri: string;
  method?: VerificationPaymentMethod;
  referenceDate?: Date;
}): Promise<VisionExtractionResult | null> {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  const referenceDate = input.referenceDate ?? new Date();
  const method = input.method ?? 'unknown';
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: env.OPENAI_VISION_MODEL,
    temperature: 0,
    max_tokens: 300,
    response_format: {
      type: 'json_object',
    },
    messages: [
      {
        role: 'system',
        content:
          'Devuelve solo JSON valido. Considera como comprobante valido una captura real, recorte, captura reenviada, correo renderizado o pantalla bancaria simple si muestra evidencia plausible de pago. Usa solamente el perfil de metodo indicado por el usuario; no cambies el metodo ni inventes campos que no se ven.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: methodPrompt(method, referenceDate),
          },
          {
            type: 'image_url',
            image_url: {
              url: input.imageDataUri,
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
    customerName?: string | null;
    alias?: string | null;
    amount?: number | null;
    currency?: string | null;
    date?: string | null;
    time?: string | null;
    bank?: string | null;
    originBank?: string | null;
    destinationBank?: string | null;
    clientId?: string | null;
    phoneNumber?: string | null;
    confidence?: number | null;
  }>(rawText);

  if (!parsed) {
    return {
      isTransferProof: false,
      reference: null,
      customerName: null,
      amount: null,
      currency: null,
      date: null,
      time: null,
      bank: null,
      originBank: null,
      destinationBank: null,
      clientId: null,
      phoneNumber: null,
      confidence: 0,
      rawText,
      failureReason: 'invalid_json',
    };
  }

  return {
    isTransferProof: Boolean(parsed.isTransferProof),
    reference: parsed.reference?.trim() || null,
    customerName: parsed.customerName?.trim() || null,
    alias: parsed.alias?.trim() || null,
    amount: typeof parsed.amount === 'number' ? parsed.amount : null,
    currency: normalizeCurrency(parsed.currency),
    date: normalizeRelativeDate(parsed.date, referenceDate),
    time: parsed.time?.trim() || null,
    bank: parsed.bank?.trim() || null,
    originBank: parsed.originBank?.trim() || null,
    destinationBank: parsed.destinationBank?.trim() || null,
    clientId: parsed.clientId?.trim() || null,
    phoneNumber: parsed.phoneNumber?.trim() || null,
    confidence:
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(100, parsed.confidence))
        : 0,
    rawText,
    failureReason: parsed.isTransferProof ? undefined : 'not_transfer_proof',
  };
}

export async function extractVerificationFromImage(
  imageUrl: string,
  referenceDate: Date = new Date(),
): Promise<VisionExtractionResult | null> {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  const { buffer, contentType } = await downloadMedia(imageUrl);
  const imageDataUri = `data:${contentType};base64,${buffer.toString('base64')}`;
  return extractVerificationFromImageDataUri({ imageDataUri, referenceDate, method: 'unknown' });
}
