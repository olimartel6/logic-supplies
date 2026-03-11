import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { sendReviewRequestEmail } from '@/lib/email';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'worker') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const { clientEmail, clientName } = await req.json();
  if (!clientEmail) {
    return NextResponse.json({ error: 'Email du client requis' }, { status: 400 });
  }

  const db = getDb();

  const site = db.prepare('SELECT id FROM job_sites WHERE id = ? AND company_id = ?').get(id, ctx.companyId);
  if (!site) return NextResponse.json({ error: 'Chantier introuvable' }, { status: 404 });

  const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(ctx.companyId) as any;
  const settings = db.prepare('SELECT google_review_url FROM company_settings WHERE company_id = ?').get(ctx.companyId) as any;

  if (!settings?.google_review_url) {
    return NextResponse.json({ error: 'Lien Google Review non configuré. Allez dans Paramètres.' }, { status: 400 });
  }

  await sendReviewRequestEmail(
    clientEmail,
    clientName || '',
    company?.name || 'Notre entreprise',
    settings.google_review_url,
  );

  db.prepare(
    'INSERT INTO review_requests (job_site_id, company_id, client_email, client_name) VALUES (?, ?, ?, ?)'
  ).run(id, ctx.companyId, clientEmail, clientName || null);

  return NextResponse.json({ ok: true });
}
