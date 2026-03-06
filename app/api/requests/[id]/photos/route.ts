import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  const db = getDb();
  const photos = db.prepare('SELECT id, url, type, created_at FROM request_photos WHERE request_id = ? AND company_id = ?').all(id, ctx.companyId);
  return NextResponse.json(photos);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  const db = getDb();

  // Verify request belongs to this company
  const request = db.prepare('SELECT id FROM requests WHERE id = ? AND company_id = ?').get(id, ctx.companyId);
  if (!request) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });

  const formData = await req.formData();
  const files = formData.getAll('files') as File[];
  const inserted = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || 'image/jpeg';
    const base64 = buffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;
    const type = mimeType.startsWith('image/') ? 'image' : 'video';
    const result = db.prepare('INSERT INTO request_photos (request_id, company_id, url, type) VALUES (?, ?, ?, ?)').run(id, ctx.companyId, dataUri, type);
    inserted.push({ id: result.lastInsertRowid, url: dataUri, type });
  }

  return NextResponse.json(inserted);
}
