import { chromium } from 'playwright';
import { getDb } from './db';

export interface PORequest {
  id: number;
  product: string;
  quantity: number;
  unit: string;
  job_site_name: string;
  job_site_address: string | null;
  electrician_name: string;
}

function buildHtml(req: PORequest, sku: string | null, unitPrice: number | null): string {
  const today = new Date();
  const dateStr = today.toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const poRef = `PO-${req.id}-${today.toISOString().slice(0, 10).replace(/-/g, '')}`;
  const subTotal = unitPrice !== null ? (unitPrice * req.quantity).toFixed(2) : null;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #111827; background: white; }
    .header { background: #1e3a5f; color: white; padding: 28px 36px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-brand h1 { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
    .header-brand p { font-size: 11px; opacity: 0.75; margin-top: 3px; }
    .header-po { text-align: right; }
    .header-po h2 { font-size: 17px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .header-po p { font-size: 12px; opacity: 0.85; margin-top: 5px; }
    .content { padding: 32px 36px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb; }
    .meta-block label { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.7px; display: block; margin-bottom: 5px; }
    .meta-block .val { font-size: 14px; font-weight: 600; color: #111827; }
    .meta-block .sub { font-size: 12px; color: #4b5563; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1e3a5f; color: white; }
    thead th { padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; }
    thead th.right { text-align: right; }
    tbody tr { border-bottom: 1px solid #f3f4f6; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody td { padding: 13px 14px; font-size: 13px; }
    tbody td.right { text-align: right; }
    .total-row td { background: #f0f4ff; border-top: 2px solid #1e3a5f; padding: 14px; font-size: 14px; }
    .note { margin-top: 28px; padding: 16px; background: #f8fafc; border-left: 3px solid #1e3a5f; border-radius: 0 6px 6px 0; font-size: 12px; color: #4b5563; }
    .footer { margin-top: 44px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #9ca3af; }
    .footer-ref { font-weight: 600; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-brand">
      <h1>⚡ LOGICSUPPLIES</h1>
      <p>Gestion de matériel électrique</p>
    </div>
    <div class="header-po">
      <h2>Bon de commande</h2>
      <p>${poRef}</p>
    </div>
  </div>

  <div class="content">
    <div class="meta">
      <div class="meta-block">
        <label>Projet / Chantier</label>
        <div class="val">${esc(req.job_site_name)}</div>
        ${req.job_site_address ? `<div class="sub">${esc(req.job_site_address)}</div>` : ''}
      </div>
      <div class="meta-block">
        <label>Date</label>
        <div class="val">${dateStr}</div>
      </div>
      <div class="meta-block">
        <label>Demandé par</label>
        <div class="val">${esc(req.electrician_name)}</div>
      </div>
      <div class="meta-block">
        <label>Fournisseur</label>
        <div class="val">Lumen</div>
        <div class="sub">lumen.ca</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:40%">Produit</th>
          <th style="width:18%">SKU</th>
          <th style="width:10%">Qté</th>
          <th style="width:10%">Unité</th>
          <th class="right" style="width:11%">Prix unit.</th>
          <th class="right" style="width:11%">Sous-total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>${esc(req.product)}</strong></td>
          <td style="color:#6b7280">${esc(sku ?? '—')}</td>
          <td>${req.quantity}</td>
          <td>${esc(req.unit)}</td>
          <td class="right">${unitPrice !== null ? '$' + unitPrice.toFixed(2) : '—'}</td>
          <td class="right">${subTotal !== null ? '<strong>$' + subTotal + '</strong>' : '—'}</td>
        </tr>
        <tr class="total-row">
          <td colspan="5" style="text-align:right;font-weight:700;color:#1e3a5f;">TOTAL</td>
          <td style="text-align:right;font-weight:800;color:#1e3a5f;font-size:15px">
            ${subTotal !== null ? '$' + subTotal : '<span style="color:#6b7280;font-size:13px">À confirmer</span>'}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="note">
      <strong>Note :</strong> Veuillez confirmer la disponibilité des articles et les délais de livraison avant de traiter cette commande.
      Ce bon de commande a été généré automatiquement par logicSupplies.
    </div>

    <div class="footer">
      <span>logicSupplies — Gestion de matériel électrique</span>
      <span class="footer-ref">${poRef}</span>
    </div>
  </div>
</body>
</html>`;
}

// Escape HTML special chars
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function generatePurchaseOrderPdf(requestId: number): Promise<Buffer> {
  const db = getDb();

  const req = db.prepare(`
    SELECT r.id, r.product, r.quantity, r.unit,
           u.name as electrician_name,
           j.name as job_site_name,
           j.address as job_site_address
    FROM requests r
    LEFT JOIN users u ON r.electrician_id = u.id
    LEFT JOIN job_sites j ON r.job_site_id = j.id
    WHERE r.id = ?
  `).get(requestId) as PORequest | undefined;

  if (!req) throw new Error(`Demande #${requestId} introuvable`);

  // Try to find matching product in catalog for SKU + price
  const product = db.prepare(
    "SELECT sku, price FROM products WHERE supplier = 'lumen' AND LOWER(name) LIKE LOWER(?) LIMIT 1"
  ).get(`%${req.product}%`) as { sku: string | null; price: number | null } | undefined;

  const html = buildHtml(req, product?.sku ?? null, product?.price ?? null);

  // Use Playwright's bundled Chromium (no executablePath needed — not scraping, just PDF)
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
}

export function logPOAction(requestId: number, action: 'preview' | 'download' | 'email_sent', companyId: number | null): void {
  try {
    getDb()
      .prepare('INSERT INTO purchase_order_logs (company_id, request_id, action) VALUES (?, ?, ?)')
      .run(companyId, requestId, action);
  } catch { /* non-critical */ }
}
