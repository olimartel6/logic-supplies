import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

const SIZE = 1080;
const GAP = 4;

async function decodePhoto(url: string): Promise<Buffer> {
  if (url.startsWith('data:')) {
    return Buffer.from(url.split(',')[1], 'base64');
  }
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

async function resizePhoto(buffer: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(buffer).resize(w, h, { fit: 'cover', position: 'center' }).toBuffer();
}

/** 1 photo: full bleed */
async function layout1(photos: Buffer[]): Promise<Buffer> {
  return resizePhoto(photos[0], SIZE, SIZE);
}

/** 2 photos: top/bottom split */
async function layout2(photos: Buffer[]): Promise<Buffer> {
  const h = (SIZE - GAP) / 2;
  const top = await resizePhoto(photos[0], SIZE, Math.floor(h));
  const bottom = await resizePhoto(photos[1], SIZE, Math.floor(h));
  return sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).composite([
    { input: top, top: 0, left: 0 },
    { input: bottom, top: Math.floor(h) + GAP, left: 0 },
  ]).png().toBuffer();
}

/** 3 photos: 1 large left + 2 small right */
async function layout3(photos: Buffer[]): Promise<Buffer> {
  const half = (SIZE - GAP) / 2;
  const leftW = Math.floor(half);
  const rightW = SIZE - leftW - GAP;
  const rightH = Math.floor((SIZE - GAP) / 2);

  const left = await resizePhoto(photos[0], leftW, SIZE);
  const topRight = await resizePhoto(photos[1], rightW, rightH);
  const bottomRight = await resizePhoto(photos[2], rightW, rightH);

  return sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).composite([
    { input: left, top: 0, left: 0 },
    { input: topRight, top: 0, left: leftW + GAP },
    { input: bottomRight, top: rightH + GAP, left: leftW + GAP },
  ]).png().toBuffer();
}

/** 4+ photos: 2x2 grid */
async function layout4(photos: Buffer[]): Promise<Buffer> {
  const cell = Math.floor((SIZE - GAP) / 2);
  const tl = await resizePhoto(photos[0], cell, cell);
  const tr = await resizePhoto(photos[1], cell, cell);
  const bl = await resizePhoto(photos[2], cell, cell);
  const br = await resizePhoto(photos[3] || photos[0], cell, cell);

  return sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).composite([
    { input: tl, top: 0, left: 0 },
    { input: tr, top: 0, left: cell + GAP },
    { input: bl, top: cell + GAP, left: 0 },
    { input: br, top: cell + GAP, left: cell + GAP },
  ]).png().toBuffer();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  // Support both old (photoUrl) and new (photoUrls) format
  const photoUrls: string[] = body.photoUrls || (body.photoUrl ? [body.photoUrl] : []);
  const text: string = body.text || '';

  if (photoUrls.length === 0) {
    return NextResponse.json({ error: 'Photo requise' }, { status: 400 });
  }

  const db = getDb();
  const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(ctx.companyId) as any;
  const settings = db.prepare('SELECT company_logo_url FROM company_settings WHERE company_id = ?').get(ctx.companyId) as any;

  try {
    // Decode all photos
    const photoBuffers = await Promise.all(photoUrls.slice(0, 4).map(decodePhoto));

    // Create layout based on number of photos
    let canvas: Buffer;
    if (photoBuffers.length === 1) canvas = await layout1(photoBuffers);
    else if (photoBuffers.length === 2) canvas = await layout2(photoBuffers);
    else if (photoBuffers.length === 3) canvas = await layout3(photoBuffers);
    else canvas = await layout4(photoBuffers);

    // Gradient overlay — stronger for better text readability
    const gradient = Buffer.from(`<svg width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0.3"/>
      <stop offset="40%" stop-color="black" stop-opacity="0"/>
      <stop offset="65%" stop-color="black" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
</svg>`);

    // Text overlay
    const companyName = company?.name || '';
    const displayText = text ? text.slice(0, 80) : '';
    const eName = companyName.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const eText = displayText.replace(/&/g, '&amp;').replace(/</g, '&lt;');

    const textOverlay = Buffer.from(`<svg width="${SIZE}" height="${SIZE}">
  <style>
    .name { fill: white; font-size: 48px; font-weight: bold; font-family: sans-serif; }
    .desc { fill: rgba(255,255,255,0.9); font-size: 28px; font-family: sans-serif; }
  </style>
  <text x="60" y="${SIZE - 90}" class="name">${eName}</text>
  ${eText ? `<text x="60" y="${SIZE - 45}" class="desc">${eText}</text>` : ''}
</svg>`);

    // Build composite layers
    const layers: sharp.OverlayOptions[] = [
      { input: gradient, blend: 'over' },
      { input: textOverlay, blend: 'over' },
    ];

    // Add logo with semi-transparent background pill
    if (settings?.company_logo_url) {
      try {
        let logoBuffer: Buffer;
        if (settings.company_logo_url.startsWith('data:')) {
          logoBuffer = Buffer.from(settings.company_logo_url.split(',')[1], 'base64');
        } else {
          const logoRes = await fetch(settings.company_logo_url);
          logoBuffer = Buffer.from(await logoRes.arrayBuffer());
        }
        const logo = await sharp(logoBuffer)
          .resize(150, 150, { fit: 'inside' })
          .toBuffer();

        // Semi-transparent dark background behind logo
        const logoMeta = await sharp(logo).metadata();
        const lw = logoMeta.width || 150;
        const lh = logoMeta.height || 150;
        const padding = 16;
        const bgW = lw + padding * 2;
        const bgH = lh + padding * 2;

        const logoBg = Buffer.from(
          `<svg width="${bgW}" height="${bgH}"><rect width="${bgW}" height="${bgH}" rx="16" fill="rgba(0,0,0,0.5)"/></svg>`
        );

        layers.push({ input: logoBg, top: 30, left: 30 });
        layers.push({ input: logo, top: 30 + padding, left: 30 + padding });
      } catch {
        // Skip logo if decode fails
      }
    }

    const output = await sharp(canvas).composite(layers).png().toBuffer();
    const base64 = output.toString('base64');

    return NextResponse.json({
      image: `data:image/png;base64,${base64}`,
    });
  } catch (err: any) {
    console.error('[Marketing] Instagram image error:', err.message);
    return NextResponse.json({ error: `Erreur image: ${err.message}` }, { status: 500 });
  }
}
