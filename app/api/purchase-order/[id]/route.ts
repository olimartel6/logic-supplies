import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getDb } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { generatePurchaseOrderPdf, logPOAction } from '@/lib/purchase-order';

// GET /api/purchase-order/[id] — generate and return PDF inline (for preview)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const requestId = Number(id);

  // Verify the request belongs to this company
  const db = getDb();
  const owned = db.prepare('SELECT id FROM requests r WHERE r.id = ? AND r.company_id = ?').get(requestId, ctx.companyId);
  if (!owned) {
    return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });
  }

  try {
    const pdf = await generatePurchaseOrderPdf(requestId);
    logPOAction(requestId, 'preview', ctx.companyId);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="PO-${requestId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/purchase-order/[id] — { action: 'download' | 'send' }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const requestId = Number(id);
  const body = await req.json().catch(() => ({}));
  const action: string = body.action || 'send';

  // Verify the request belongs to this company
  const db = getDb();
  const owned = db.prepare('SELECT id FROM requests r WHERE r.id = ? AND r.company_id = ?').get(requestId, ctx.companyId);
  if (!owned) {
    return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });
  }

  if (action === 'download') {
    try {
      const pdf = await generatePurchaseOrderPdf(requestId);
      logPOAction(requestId, 'download', ctx.companyId);
      return new Response(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="bon-de-commande-${requestId}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // action === 'send' — generate PDF and email to Lumen rep
  const settings = db
    .prepare('SELECT lumen_rep_email FROM company_settings WHERE company_id = ?')
    .get(ctx.companyId) as { lumen_rep_email: string | null } | undefined;

  const repEmail = settings?.lumen_rep_email?.trim();
  if (!repEmail) {
    return NextResponse.json({
      success: false,
      error: "Email du représentant Lumen non configuré. Allez dans Paramètres → Représentant Lumen.",
    });
  }

  if (!process.env.SMTP_USER) {
    return NextResponse.json({
      success: false,
      error: "Serveur email non configuré (SMTP_USER manquant).",
    });
  }

  try {
    const pdf = await generatePurchaseOrderPdf(requestId);

    // Fetch request details for the email subject
    const request = db.prepare(`
      SELECT r.product, j.name as job_site_name
      FROM requests r
      LEFT JOIN job_sites j ON r.job_site_id = j.id
      WHERE r.id = ? AND r.company_id = ?
    `).get(requestId, ctx.companyId) as { product: string; job_site_name: string } | undefined;

    const jobSiteName = request?.job_site_name || `Demande #${requestId}`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });

    await transporter.sendMail({
      from: `"logicSupplies" <${process.env.SMTP_USER}>`,
      to: repEmail,
      subject: `Bon de commande - ${jobSiteName}`,
      html: `
        <div style="font-family:-apple-system,Arial,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#1e3a5f;color:white;padding:24px 28px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;font-size:18px">&#x26A1; logicSupplies — Bon de commande</h2>
          </div>
          <div style="background:#f9fafb;padding:24px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p style="margin:0 0 16px">Bonjour,</p>
            <p style="margin:0 0 16px">
              Veuillez trouver ci-joint le bon de commande pour le projet
              <strong>${jobSiteName}</strong>.
            </p>
            <p style="margin:0 0 16px">
              Merci de confirmer la disponibilité des articles et les délais de livraison.
            </p>
            <p style="margin:0">Cordialement,<br><strong>L'équipe logicSupplies</strong></p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `bon-de-commande-PO-${requestId}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });

    logPOAction(requestId, 'email_sent', ctx.companyId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
