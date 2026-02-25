import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { encrypt } from '@/lib/encrypt';

// Max allowed on Vercel Hobby plan (local-only flow anyway — Chrome on macOS)
export const maxDuration = 300;

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Dedicated Chrome profile for HD — separate from the user's main Chrome so both can run simultaneously.
// Stored in a persistent location so cookies survive between app restarts.
const HD_PROFILE_DIR = path.join(os.homedir(), '.logicsupplies', 'hd-chrome-profile');

const execAsync = promisify(exec);

/**
 * Retrieves Chrome's AES-128 encryption key from the macOS Keychain.
 * Chrome stores a random password under "Chrome Safe Storage" and derives
 * a 16-byte key via PBKDF2(password, 'saltysalt', 1003 iterations, SHA-1).
 */
async function getChromeAesKey(): Promise<Buffer> {
  const { stdout } = await execAsync(
    'security find-generic-password -w -s "Chrome Safe Storage" -a Chrome'
  );
  const password = stdout.trim();
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, 'saltysalt', 1003, 16, 'sha1', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Decrypts a Chrome cookie value.
 * Chrome on macOS prefixes encrypted values with 'v10' or 'v11' then uses
 * AES-128-CBC with IV = 16 space bytes and PKCS5 padding.
 */
function decryptChromeValue(encryptedBuf: Buffer, key: Buffer): string {
  if (!encryptedBuf || encryptedBuf.length < 3) return '';
  const prefix = encryptedBuf.slice(0, 3).toString('ascii');
  if (prefix !== 'v10' && prefix !== 'v11') {
    // Unencrypted (session cookies or older Chrome versions)
    return encryptedBuf.toString('utf-8');
  }
  try {
    const iv = Buffer.alloc(16, ' '); // 16 × 0x20 (space character)
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuf.slice(3)),
      decipher.final(),
    ]);
    // Remove PKCS5 padding
    const padLen = decrypted[decrypted.length - 1];
    return decrypted.slice(0, decrypted.length - padLen).toString('utf-8');
  } catch {
    return '';
  }
}

/**
 * Reads and decrypts homedepot.ca cookies from Chrome's SQLite Cookies database.
 * Works by copying the DB to a temp file (avoids WAL lock from a running Chrome).
 */
interface ChromeCookie {
  name: string; value: string; domain: string; path: string;
  expires: number; secure: boolean; httpOnly: boolean; sameSite: string;
}

async function readHDCookies(): Promise<ChromeCookie[]> {
  const cookiesDbPath = path.join(HD_PROFILE_DIR, 'Default', 'Cookies');
  if (!fs.existsSync(cookiesDbPath)) {
    throw new Error(
      'Fichier de cookies introuvable. Assurez-vous de vous être connecté dans Chrome avant de fermer la fenêtre.'
    );
  }

  const key = await getChromeAesKey();

  // Copy to temp path so SQLite can open it even if Chrome left WAL files
  const tmpPath = path.join(os.tmpdir(), `logicsupplies-hd-cookies-${Date.now()}.db`);
  fs.copyFileSync(cookiesDbPath, tmpPath);

  try {
    const db = new Database(tmpPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT host_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly
         FROM cookies
         WHERE host_key LIKE '%homedepot.ca%'`
      )
      .all() as any[];
    db.close();

    return rows
      .map(row => {
        if (!row.encrypted_value) return null;
        const encBuf = Buffer.from(row.encrypted_value);
        const value = decryptChromeValue(encBuf, key);
        if (!value) return null;

        // Chrome epoch: microseconds since 1601-01-01. UNIX epoch offset = 11644473600 s.
        const expiresUtc = Number(row.expires_utc || 0);
        const expires = expiresUtc > 0
          ? Math.floor(expiresUtc / 1_000_000) - 11_644_473_600
          : 0;

        return {
          name: row.name,
          value,
          domain: row.host_key,
          path: row.path || '/',
          expires,
          secure: Boolean(row.is_secure),
          httpOnly: Boolean(row.is_httponly),
          sameSite: 'None',
        };
      })
      .filter((c): c is ChromeCookie => c !== null);
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const db = getDb();
  const account = db
    .prepare("SELECT * FROM supplier_accounts WHERE supplier = 'homedepot' AND active = 1 AND company_id = ? LIMIT 1")
    .get(ctx.companyId) as any;
  if (!account) {
    return NextResponse.json({ success: false, error: 'Aucun compte Home Depot configuré' });
  }

  // Create the dedicated Chrome profile directory if it doesn't exist yet
  fs.mkdirSync(HD_PROFILE_DIR, { recursive: true });

  // Kill any existing Chrome instance using our HD profile so the new process
  // doesn't exit immediately (macOS redirects to the existing instance otherwise).
  try {
    await execAsync(`pkill -f "${HD_PROFILE_DIR}" 2>/dev/null || true`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch { /* ignore — no existing process */ }

  // Launch Chrome WITHOUT any remote debugging or CDP — Akamai cannot detect automation
  // when the browser has no DevTools Protocol attached.
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      `--user-data-dir=${HD_PROFILE_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-translate',
      'https://www.homedepot.ca/myaccount',
    ],
    { stdio: 'ignore' }
  );

  // Block until the user closes Chrome (signals that login is complete)
  await new Promise<void>(resolve => {
    chromeProcess.on('close', resolve);
    chromeProcess.on('error', resolve);
  });

  // Brief pause to let SQLite flush any pending writes
  await new Promise(resolve => setTimeout(resolve, 800));

  try {
    const cookies = await readHDCookies();
    if (cookies.length === 0) {
      return NextResponse.json({
        success: false,
        error:
          'Aucun cookie homedepot.ca trouvé. Assurez-vous de vous être connecté avant de fermer la fenêtre Chrome.',
      });
    }

    const encrypted = encrypt(JSON.stringify(cookies));
    db.prepare(
      "UPDATE supplier_accounts SET session_cookies = ? WHERE supplier = 'homedepot' AND username = ? AND company_id = ?"
    ).run(encrypted, account.username, ctx.companyId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
