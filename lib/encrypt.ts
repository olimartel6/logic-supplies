import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const rawKey = process.env.ENCRYPTION_KEY;
if (!rawKey && process.env.NODE_ENV === 'production') {
  throw new Error('ENCRYPTION_KEY env var is required in production');
}
if (!rawKey) {
  console.warn('[SECURITY] ENCRYPTION_KEY not set — using insecure dev default');
}
if (rawKey && rawKey.length < 32) {
  throw new Error('ENCRYPTION_KEY must be at least 32 characters');
}
const KEY = Buffer.from(
  (rawKey || 'sparky-encryption-key-32-chars!!').padEnd(32).slice(0, 32)
);

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decrypt(encoded: string): string {
  const [ivHex, tagHex, encryptedHex] = encoded.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
