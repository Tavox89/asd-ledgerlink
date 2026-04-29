import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function deriveKey(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecretValue(value: string, secret: string) {
  const normalizedSecret = secret.trim();
  if (!normalizedSecret) {
    throw new Error('payment_config_encryption_key_missing');
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(normalizedSecret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptSecretValue(value: string, secret: string) {
  const normalizedSecret = secret.trim();
  if (!normalizedSecret) {
    throw new Error('payment_config_encryption_key_missing');
  }

  const [version, rawIv, rawTag, rawEncrypted] = value.split(':');
  if (version !== 'v1' || !rawIv || !rawTag || !rawEncrypted) {
    throw new Error('payment_config_encrypted_value_invalid');
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(normalizedSecret), Buffer.from(rawIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(rawTag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(rawEncrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
