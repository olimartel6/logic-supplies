import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

const SIZE = 1080;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const { photoUrl, text } = await req.json();
  if (!photoUrl) {
    return NextResponse.json({ error: 'Photo requise' }, { status: 400 });
  }

  const db = getDb();
  const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(ctx.companyId) as any;
  const settings = db.prepare('SELECT company_logo_url FROM company_settings WHERE company_id = ?').get(ctx.companyId) as any;

  // Fetch the photo
  const photoRes = await fetch(photoUrl);
  const photoBuffer = Buffer.from(await photoRes.arrayBuffer());

  // Resize/crop photo to fill 1080x1080
  const photo = await sharp(photoBuffer)
    .resize(SIZE, SIZE, { fit: 'cover', position: 'center' })
    .toBuffer();

  // Create dark gradient overlay at bottom
  const gradient = Buffer.from(`<svg width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0"/>
      <stop offset="60%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.75"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
</svg>`);

  // Company name text overlay
  const companyName = company?.name || '';
  const displayText = text ? text.slice(0, 80) : '';
  const escapedName = companyName.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const escapedText = displayText.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const textOverlay = Buffer.from(`<svg width="${SIZE}" height="${SIZE}">
  <style>
    .name { fill: white; font-size: 42px; font-weight: bold; font-family: sans-serif; }
    .desc { fill: rgba(255,255,255,0.9); font-size: 28px; font-family: sans-serif; }
  </style>
  <text x="60" y="${SIZE - 100}" class="name">${escapedName}</text>
  ${escapedText ? `<text x="60" y="${SIZE - 55}" class="desc">${escapedText}</text>` : ''}
</svg>`);

  // Build composite layers
  const layers: sharp.OverlayOptions[] = [
    { input: gradient, blend: 'over' },
    { input: textOverlay, blend: 'over' },
  ];

  // Add logo if available
  if (settings?.company_logo_url) {
    try {
      const logoRes = await fetch(settings.company_logo_url);
      const logoBuffer = Buffer.from(await logoRes.arrayBuffer());
      const logo = await sharp(logoBuffer)
        .resize(120, 120, { fit: 'inside' })
        .toBuffer();
      layers.push({ input: logo, top: 40, left: 40 });
    } catch {
      // Skip logo if fetch fails
    }
  }

  const output = await sharp(photo).composite(layers).png().toBuffer();
  const base64 = output.toString('base64');

  return NextResponse.json({
    image: `data:image/png;base64,${base64}`,
  });
}
