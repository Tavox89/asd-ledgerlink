import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    break;
  }
}

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
      return false;
    }
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_PORT: z.coerce.number().default(3000),
  WEB_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLOUD_PROJECT_ID: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:4000/auth/google/callback'),
  GOOGLE_GMAIL_ACCOUNT: z.string().email().or(z.literal('')).default(''),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GMAIL_PUBSUB_TOPIC: z.string().min(1),
  GMAIL_PUBSUB_SUBSCRIPTION: z.string().min(1),
  GMAIL_PUBSUB_PULL_MAX_MESSAGES: z.coerce.number().int().min(1).max(50).default(10),
  GMAIL_PUBSUB_WORKER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(process.env.NODE_ENV === 'development' ? 15000 : 0),
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_WHATSAPP_FROM: z.string().default(''),
  TWILIO_SERVICE_SID: z.string().default(''),
  TWILIO_VALIDATE_SIGNATURE: booleanFromEnv.default(process.env.NODE_ENV === 'production'),
  WHATSAPP_ALLOWED_TEST_NUMBERS: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_VISION_MODEL: z.string().default('gpt-4o'),
  APP_NAME: z.string().default('LedgerLink by ASD Labs'),
  APP_OWNER: z.string().default('Tavox'),
  APP_COMPANY: z.string().default('ASD Labs'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export const env = envSchema.parse(process.env);
