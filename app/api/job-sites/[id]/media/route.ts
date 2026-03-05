import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { uploadToR2 } from '@/lib/r2';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;

  const { id } = await params;
  const db = getDb();
  const media = db.prepare(
    'SELECT id, url, type, created_at FROM job_site_media WHERE job_site_id = ? AND company_id = ? ORDER BY created_at DESC'
  ).all(id, ctx.companyId);

  return NextResponse.json(media);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const db = getDb();

  const site = db.prepare('SELECT id FROM job_sites WHERE id = ? AND company_id = ?').get(id, ctx.companyId);
  if (!site) return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 });

  const formData = await req.formData();
  const files = formData.getAll('files') as File[];
  if (files.length === 0) {
    return NextResponse.json({ error: 'Aucun fichier' }, { status: 400 });
  }

  const uploaded: { id: number; url: string; type: string }[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const url = await uploadToR2(buffer, file.type, `projects/${ctx.companyId}/${id}`);

    const result = db.prepare(
      'INSERT INTO job_site_media (job_site_id, company_id, url, type) VALUES (?, ?, ?, ?)'
    ).run(id, ctx.companyId, url, type);

    uploaded.push({ id: Number(result.lastInsertRowid), url, type });
  }

  return NextResponse.json({ uploaded });
}
