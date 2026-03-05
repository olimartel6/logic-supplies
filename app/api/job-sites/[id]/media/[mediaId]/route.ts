import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { deleteFromR2 } from '@/lib/r2';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id, mediaId } = await params;
  const db = getDb();

  const media = db.prepare(
    'SELECT url FROM job_site_media WHERE id = ? AND job_site_id = ? AND company_id = ?'
  ).get(mediaId, id, ctx.companyId) as { url: string } | undefined;

  if (!media) return NextResponse.json({ error: 'Média introuvable' }, { status: 404 });

  await deleteFromR2(media.url);
  db.prepare('DELETE FROM job_site_media WHERE id = ?').run(mediaId);

  return NextResponse.json({ ok: true });
}
