import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getDb } from '@/lib/db';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';

// ─── Helpers ────────────────────────────────────────────────────────────────

const SUPPLIER_LABEL: Record<string, string> = {
  lumen: 'Lumen',
  canac: 'Canac',
  homedepot: 'Home Depot',
};
const SUPPLIER_COLOR: Record<string, string> = {
  lumen: 'FFDC2626',
  canac: 'FF2563EB',
  homedepot: 'FFEA580C',
};
const SUPPLIER_FILL: Record<string, string> = {
  lumen: 'FFFEF2F2',
  canac: 'FFEFF6FF',
  homedepot: 'FFFFF7ED',
};

function fmtMoney(n: number) {
  return n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
}

function monthLabel(month: string) {
  const [y, m] = month.split('-');
  const d = new Date(parseInt(y), parseInt(m) - 1);
  return d.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
}

// ─── Chart rendering (Playwright + Canvas 2D) ────────────────────────────────

function buildChartHtml(
  title: string,
  labels: string[],
  values: number[],
  colors: string[],
  W = 640,
  H = 380,
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
const DATA = ${JSON.stringify({ title, labels, values, colors })};
const W=${W}, H=${H};
const P = { top:54, right:24, bottom:72, left:72 };
const plotW = W - P.left - P.right;
const plotH = H - P.top - P.bottom;
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);
// Title
ctx.fillStyle='#1e293b'; ctx.font='bold 15px Arial'; ctx.textAlign='center';
ctx.fillText(DATA.title, W/2, 30);
// Grid
const max = Math.max(...DATA.values, 1);
const gridN = 5;
for (let i=0; i<=gridN; i++) {
  const y = P.top + plotH * (1 - i/gridN);
  const v = (max/gridN)*i;
  ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(P.left-4, y); ctx.lineTo(W-P.right, y); ctx.stroke();
  ctx.fillStyle='#94a3b8'; ctx.font='10px Arial'; ctx.textAlign='right';
  const lbl = v>=1000 ? (v/1000).toFixed(v>=10000?0:1)+'k$' : v.toFixed(0)+'$';
  ctx.fillText(lbl, P.left-8, y+3.5);
}
// Bars
const bw = plotW / DATA.labels.length;
DATA.labels.forEach((lbl, i) => {
  const bh = Math.max((DATA.values[i]/max)*plotH, 2);
  const x = P.left + i*bw + bw*0.15;
  const bwidth = bw*0.7;
  const y = P.top + plotH - bh;
  // Bar shadow
  ctx.fillStyle='rgba(0,0,0,0.06)'; ctx.fillRect(x+3, y+3, bwidth, bh);
  // Bar
  ctx.fillStyle = DATA.colors[i % DATA.colors.length]; ctx.fillRect(x, y, bwidth, bh);
  // Value label
  const fmt = v => v>=1000 ? (v/1000).toFixed(v>=10000?0:1)+'k$' : v.toFixed(0)+'$';
  ctx.fillStyle='#1e293b'; ctx.font='bold 11px Arial'; ctx.textAlign='center';
  ctx.fillText(fmt(DATA.values[i]), x+bwidth/2, y-7);
  // X label — wrap if needed
  ctx.fillStyle='#475569'; ctx.font='11px Arial';
  const words = lbl.split(' ');
  if (words.length > 1 && bw < 100) {
    ctx.fillText(words[0], x+bwidth/2, P.top+plotH+18);
    ctx.fillText(words.slice(1).join(' '), x+bwidth/2, P.top+plotH+31);
  } else {
    ctx.fillText(lbl, x+bwidth/2, P.top+plotH+18);
  }
});
</script></body></html>`;
}

async function renderCharts(
  charts: Array<{ title: string; labels: string[]; values: number[]; colors: string[] }>,
): Promise<Buffer[]> {
  const W = 640, H = 380;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const results: Buffer[] = [];
  try {
    for (const chart of charts) {
      const page = await browser.newPage();
      await page.setViewportSize({ width: W, height: H });
      await page.setContent(buildChartHtml(chart.title, chart.labels, chart.values, chart.colors, W, H), { waitUntil: 'load' });
      await page.waitForTimeout(250);
      const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
      results.push(Buffer.from(png));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

// ─── ExcelJS styling helpers ─────────────────────────────────────────────────

function hdr(ws: ExcelJS.Worksheet, row: number, cols: string[], label: string) {
  const r = ws.getRow(row);
  cols.forEach((c, i) => {
    const cell = ws.getCell(`${c}${row}`);
    cell.value = i === 0 ? label : null;
  });
  const start = cols[0] + row;
  const end = cols[cols.length - 1] + row;
  ws.mergeCells(`${start}:${end}`);
  const cell = ws.getCell(start);
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
  r.height = 22;
}

function headerRow(ws: ExcelJS.Worksheet, rowNum: number, headers: string[]) {
  const row = ws.getRow(rowNum);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF1E293B' } },
    };
  });
  row.height = 22;
}

function dataRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  values: (string | number | Date | null)[],
  fillArgb?: string,
  numFormats?: Record<number, string>,
) {
  const row = ws.getRow(rowNum);
  const fill = fillArgb
    ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: fillArgb } }
    : { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: rowNum % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1);
    cell.value = v;
    cell.fill = fill;
    cell.font = { size: 10 };
    cell.border = {
      bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
    };
    if (numFormats?.[i]) cell.numFmt = numFormats[i];
  });
  row.height = 18;
}

function totalRow(ws: ExcelJS.Worksheet, rowNum: number, values: (string | number | null)[], numFormats?: Record<number, string>) {
  const row = ws.getRow(rowNum);
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1);
    cell.value = v;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.border = { top: { style: 'thin', color: { argb: 'FF475569' } } };
    if (numFormats?.[i]) cell.numFmt = numFormats[i];
  });
  row.height = 20;
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const db = getDb();
  const month = req.nextUrl.searchParams.get('month');

  // Return available months when no month param
  if (!month) {
    const rows = db.prepare(`
      SELECT DISTINCT strftime('%Y-%m', COALESCE(decision_date, created_at)) as month
      FROM requests
      WHERE status = 'approved'
        AND company_id = ?
      ORDER BY month DESC
      LIMIT 24
    `).all(ctx.companyId) as { month: string }[];
    return NextResponse.json(rows.map(r => r.month));
  }

  // ─── Data query ──────────────────────────────────────────────────────────
  const orders = db.prepare(`
    SELECT
      r.id,
      r.product,
      r.quantity,
      r.unit,
      COALESCE(so.supplier, r.supplier, 'lumen') as actual_supplier,
      strftime('%Y-%m-%d', COALESCE(r.decision_date, r.created_at)) as order_date,
      j.name as job_site_name,
      j.budget_total,
      j.budget_committed,
      u.name as electrician_name,
      COALESCE(so.status, 'pending') as order_status,
      so.supplier_order_id,
      r.urgency,
      (SELECT price FROM products
       WHERE LOWER(name) LIKE '%' || LOWER(r.product) || '%'
       ORDER BY price ASC LIMIT 1) as unit_price
    FROM requests r
    LEFT JOIN job_sites j ON r.job_site_id = j.id
    LEFT JOIN users u ON r.electrician_id = u.id
    LEFT JOIN supplier_orders so ON so.request_id = r.id
    WHERE r.status = 'approved'
      AND r.company_id = ?
      AND strftime('%Y-%m', COALESCE(r.decision_date, r.created_at)) = ?
    ORDER BY order_date DESC, r.id DESC
  `).all(ctx.companyId, month) as any[];

  if (orders.length === 0) {
    return NextResponse.json({ error: 'Aucune commande pour ce mois' }, { status: 404 });
  }

  // ─── Aggregations ─────────────────────────────────────────────────────────
  type SupplierStat = { count: number; total: number };
  const bySupplier: Record<string, SupplierStat> = {};
  type SiteStat = { count: number; total: number; budget_total: number | null; budget_committed: number };
  const bySite: Record<string, SiteStat> = {};
  let grandTotal = 0;
  let urgentCount = 0;

  for (const o of orders) {
    const sup = o.actual_supplier || 'lumen';
    const amount = (o.unit_price ?? 0) * o.quantity;
    grandTotal += amount;
    if (o.urgency) urgentCount++;
    if (!bySupplier[sup]) bySupplier[sup] = { count: 0, total: 0 };
    bySupplier[sup].count++;
    bySupplier[sup].total += amount;
    const site = o.job_site_name || 'Non assigné';
    if (!bySite[site]) bySite[site] = { count: 0, total: 0, budget_total: o.budget_total, budget_committed: o.budget_committed ?? 0 };
    bySite[site].count++;
    bySite[site].total += amount;
  }

  // ─── Generate chart images ─────────────────────────────────────────────────
  const supplierKeys = Object.keys(bySupplier).sort((a, b) => bySupplier[b].total - bySupplier[a].total);
  const siteKeys = Object.keys(bySite).sort((a, b) => bySite[b].total - bySite[a].total).slice(0, 8);

  const [supplierChartPng, siteChartPng] = await renderCharts([
    {
      title: 'Montant total par fournisseur',
      labels: supplierKeys.map(k => SUPPLIER_LABEL[k] || k),
      values: supplierKeys.map(k => bySupplier[k].total),
      colors: supplierKeys.map(k => '#' + (SUPPLIER_COLOR[k] || 'FF475569').slice(2)),
    },
    {
      title: 'Montant par chantier',
      labels: siteKeys,
      values: siteKeys.map(k => bySite[k].total),
      colors: ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#10b981', '#ef4444'],
    },
  ]);

  // ─── Build workbook ───────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = 'logicSupplies';
  wb.created = new Date();
  const label = monthLabel(month);

  // ExcelJS expects Node.js Buffer type; cast via ArrayBuffer to satisfy strict typings
  const supChartId = wb.addImage({ buffer: supplierChartPng.buffer as ArrayBuffer, extension: 'png' });
  const siteChartId = wb.addImage({ buffer: siteChartPng.buffer as ArrayBuffer, extension: 'png' });

  // ── Sheet 1: Résumé ──────────────────────────────────────────────────────
  const ws1 = wb.addWorksheet('📊 Résumé', { views: [{ showGridLines: false }] });
  ws1.properties.defaultColWidth = 18;

  // Title
  ws1.mergeCells('A1:H2');
  const titleCell = ws1.getCell('A1');
  titleCell.value = `⚡ LOGICSUPPLIES — Rapport mensuel des commandes — ${label.charAt(0).toUpperCase() + label.slice(1)}`;
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(1).height = 28;
  ws1.getRow(2).height = 28;

  // KPI cards (row 4-7)
  ws1.getRow(3).height = 10;
  const kpis = [
    { label: '📦 Commandes approuvées', value: orders.length.toString(), col: 'A' },
    { label: '💰 Montant total estimé', value: fmtMoney(grandTotal), col: 'C' },
    { label: '🚨 Commandes urgentes', value: urgentCount.toString(), col: 'E' },
    { label: '🏭 Fournisseurs actifs', value: supplierKeys.length.toString(), col: 'G' },
  ];
  kpis.forEach(({ label: lbl, value, col }) => {
    const endCol = String.fromCharCode(col.charCodeAt(0) + 1);
    ws1.mergeCells(`${col}4:${endCol}4`);
    ws1.mergeCells(`${col}5:${endCol}6`);
    const lCell = ws1.getCell(`${col}4`);
    const vCell = ws1.getCell(`${col}5`);
    lCell.value = lbl;
    lCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    lCell.font = { bold: true, color: { argb: 'FFCBD5E1' }, size: 9 };
    lCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(4).height = 18;
    vCell.value = value;
    vCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    vCell.font = { bold: true, size: 16, color: { argb: 'FF1E293B' } };
    vCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(5).height = 30;
  });

  // Supplier summary table (rows 9+)
  ws1.getRow(8).height = 10;
  hdr(ws1, 9, ['A','B','C','D','E'], '🏭 Répartition par fournisseur');
  headerRow(ws1, 10, ['Fournisseur', 'Nb commandes', 'Montant total', '% du total', 'Montant moyen']);
  ws1.getColumn(1).width = 18;
  ws1.getColumn(2).width = 16;
  ws1.getColumn(3).width = 20;
  ws1.getColumn(4).width = 14;
  ws1.getColumn(5).width = 18;

  let r = 11;
  for (const sup of supplierKeys) {
    const s = bySupplier[sup];
    dataRow(ws1, r, [
      SUPPLIER_LABEL[sup] || sup,
      s.count,
      s.total,
      grandTotal > 0 ? s.total / grandTotal : 0,
      s.count > 0 ? s.total / s.count : 0,
    ], SUPPLIER_FILL[sup] || 'FFFFFFFF', { 2: '#,##0.00" $"', 3: '0.0%', 4: '#,##0.00" $"' });
    r++;
  }
  totalRow(ws1, r, ['TOTAL', orders.length, grandTotal, 1, grandTotal / orders.length],
    { 2: '#,##0.00" $"', 3: '0.0%', 4: '#,##0.00" $"' });

  // Embed supplier chart
  ws1.addImage(supChartId, { tl: { col: 5.2, row: 8.5 }, ext: { width: 560, height: 332 } });

  // ── Sheet 2: Toutes les commandes ────────────────────────────────────────
  const ws2 = wb.addWorksheet('📋 Commandes', { views: [{ state: 'frozen', ySplit: 2, showGridLines: false }] });
  ws2.columns = [
    { key: 'id',        header: '#',              width: 7 },
    { key: 'date',      header: 'Date',            width: 13 },
    { key: 'product',   header: 'Produit',         width: 38 },
    { key: 'qty',       header: 'Qté',             width: 7 },
    { key: 'unit',      header: 'Unité',           width: 10 },
    { key: 'supplier',  header: 'Fournisseur',     width: 16 },
    { key: 'site',      header: 'Chantier',        width: 22 },
    { key: 'electrician', header: 'Électricien',   width: 20 },
    { key: 'unit_price', header: 'Prix unitaire',  width: 16 },
    { key: 'total',     header: 'Total estimé',    width: 16 },
    { key: 'status',    header: 'Statut commande', width: 18 },
    { key: 'order_id',  header: 'N° commande',     width: 20 },
    { key: 'urgency',   header: 'Urgent',          width: 10 },
  ];

  hdr(ws2, 1, ['A','B','C','D','E','F','G','H','I','J','K','L','M'], `Toutes les commandes — ${label}`);
  headerRow(ws2, 2, ws2.columns.map(c => c.header as string));
  ws2.autoFilter = { from: 'A2', to: 'M2' };

  const statusLabel: Record<string, string> = { confirmed: 'Confirmée', pending: 'Panier', failed: 'Échouée', cancelled: 'Annulée' };
  let row2 = 3;
  for (const o of orders) {
    const sup = o.actual_supplier || 'lumen';
    const amount = (o.unit_price ?? 0) * o.quantity;
    dataRow(ws2, row2, [
      o.id,
      o.order_date,
      o.product,
      o.quantity,
      o.unit,
      SUPPLIER_LABEL[sup] || sup,
      o.job_site_name || '—',
      o.electrician_name || '—',
      o.unit_price ?? null,
      amount > 0 ? amount : null,
      statusLabel[o.order_status] || o.order_status,
      o.supplier_order_id || '—',
      o.urgency ? '🚨 Oui' : '',
    ], SUPPLIER_FILL[sup] || undefined, { 8: '#,##0.00" $"', 9: '#,##0.00" $"' });
    row2++;
  }
  totalRow(ws2, row2, ['', '', `TOTAL — ${orders.length} commandes`, '', '', '', '', '', '', grandTotal, '', '', ''],
    { 9: '#,##0.00" $"' });

  // ── Sheet 3: Par fournisseur ──────────────────────────────────────────────
  const ws3 = wb.addWorksheet('🏭 Par fournisseur', { views: [{ showGridLines: false }] });
  ws3.columns = [
    { width: 18 }, { width: 16 }, { width: 20 }, { width: 14 }, { width: 18 }, { width: 14 },
  ];

  hdr(ws3, 1, ['A','B','C','D','E','F'], `Résumé par fournisseur — ${label}`);
  headerRow(ws3, 2, ['Fournisseur', 'Nb commandes', 'Montant total', 'Part (%)', 'Montant moyen', 'Montant max']);

  // Per-supplier detail
  let r3 = 3;
  for (const sup of supplierKeys) {
    const s = bySupplier[sup];
    const supOrders = orders.filter((o: any) => (o.actual_supplier || 'lumen') === sup);
    const maxOrder = Math.max(...supOrders.map((o: any) => (o.unit_price ?? 0) * o.quantity));
    dataRow(ws3, r3, [
      SUPPLIER_LABEL[sup] || sup,
      s.count,
      s.total,
      grandTotal > 0 ? s.total / grandTotal : 0,
      s.count > 0 ? s.total / s.count : 0,
      maxOrder,
    ], SUPPLIER_FILL[sup] || 'FFFFFFFF', { 2: '#,##0.00" $"', 3: '0.0%', 4: '#,##0.00" $"', 5: '#,##0.00" $"' });
    r3++;
  }
  totalRow(ws3, r3, ['TOTAL', orders.length, grandTotal, 1, grandTotal / orders.length, ''],
    { 2: '#,##0.00" $"', 3: '0.0%', 4: '#,##0.00" $"' });
  r3 += 2;

  // Breakdown per supplier
  for (const sup of supplierKeys) {
    hdr(ws3, r3, ['A','B','C','D','E','F'], `${SUPPLIER_LABEL[sup] || sup} — détail des commandes`);
    r3++;
    headerRow(ws3, r3, ['Date', 'Produit', 'Qté', 'Unité', 'Prix unitaire', 'Total estimé']);
    r3++;
    const supOrders = orders.filter((o: any) => (o.actual_supplier || 'lumen') === sup);
    let supTotal = 0;
    for (const o of supOrders) {
      const amount = (o.unit_price ?? 0) * o.quantity;
      supTotal += amount;
      dataRow(ws3, r3, [
        o.order_date, o.product, o.quantity, o.unit, o.unit_price ?? null, amount > 0 ? amount : null,
      ], SUPPLIER_FILL[sup], { 4: '#,##0.00" $"', 5: '#,##0.00" $"' });
      r3++;
    }
    totalRow(ws3, r3, ['', `Sous-total ${SUPPLIER_LABEL[sup]}`, '', '', '', supTotal],
      { 5: '#,##0.00" $"' });
    r3 += 2;
  }

  // Supplier chart
  ws3.addImage(supChartId, { tl: { col: 6.5, row: 1.5 }, ext: { width: 560, height: 332 } });

  // ── Sheet 4: Par chantier ─────────────────────────────────────────────────
  const ws4 = wb.addWorksheet('🏗️ Par chantier', { views: [{ showGridLines: false }] });
  ws4.columns = [
    { width: 24 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 },
  ];

  hdr(ws4, 1, ['A','B','C','D','E','F'], `Résumé par chantier — ${label}`);
  headerRow(ws4, 2, ['Chantier', 'Nb commandes', 'Engagé ce mois', 'Budget total', 'Engagé total', '% utilisé']);

  let r4 = 3;
  const sortedSites = Object.entries(bySite).sort((a, b) => b[1].total - a[1].total);
  for (const [site, stat] of sortedSites) {
    const pct = stat.budget_total ? stat.budget_committed / stat.budget_total : null;
    dataRow(ws4, r4, [
      site,
      stat.count,
      stat.total,
      stat.budget_total ?? '—',
      stat.budget_committed,
      pct,
    ], undefined, { 2: '#,##0.00" $"', 4: '#,##0.00" $"', 5: '0.0%' });
    r4++;
  }
  totalRow(ws4, r4, ['TOTAL', orders.length, grandTotal, '', '', ''],
    { 2: '#,##0.00" $"' });
  r4 += 2;

  // Breakdown per site
  for (const [site, _stat] of sortedSites) {
    const siteOrders = orders.filter((o: any) => (o.job_site_name || 'Non assigné') === site);
    hdr(ws4, r4, ['A','B','C','D','E','F'], `${site} — détail des commandes`);
    r4++;
    headerRow(ws4, r4, ['Date', 'Produit', 'Qté', 'Unité', 'Fournisseur', 'Total estimé']);
    r4++;
    let siteTotal = 0;
    for (const o of siteOrders) {
      const sup = o.actual_supplier || 'lumen';
      const amount = (o.unit_price ?? 0) * o.quantity;
      siteTotal += amount;
      dataRow(ws4, r4, [
        o.order_date, o.product, o.quantity, o.unit, SUPPLIER_LABEL[sup] || sup, amount > 0 ? amount : null,
      ], SUPPLIER_FILL[sup], { 5: '#,##0.00" $"' });
      r4++;
    }
    totalRow(ws4, r4, ['', `Sous-total ${site}`, '', '', '', siteTotal], { 5: '#,##0.00" $"' });
    r4 += 2;
  }

  // Site chart
  ws4.addImage(siteChartId, { tl: { col: 6.5, row: 1.5 }, ext: { width: 560, height: 332 } });

  // ── Sheets 5+: One sheet per project ─────────────────────────────────────
  for (const [site, stat] of sortedSites) {
    const siteOrders = orders.filter((o: any) => (o.job_site_name || 'Non assigné') === site);
    if (siteOrders.length === 0) continue;

    // Excel sheet name: max 31 chars, no special chars
    const sheetName = site.replace(/[\/\\?*\[\]:]/g, '').slice(0, 31);
    const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
    ws.columns = [
      { width: 13 }, { width: 38 }, { width: 7 }, { width: 10 },
      { width: 16 }, { width: 18 }, { width: 16 }, { width: 20 }, { width: 12 },
    ];

    // Title row
    ws.mergeCells('A1:I1');
    const tCell = ws.getCell('A1');
    tCell.value = `${site} — ${label}`;
    tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    tCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 26;

    // Budget KPI row
    const hasBudget = stat.budget_total != null && stat.budget_total > 0;
    const pct = hasBudget ? Math.round((stat.budget_committed / stat.budget_total!) * 100) : null;
    const remaining = hasBudget ? stat.budget_total! - stat.budget_committed : null;
    const kpiPairs: [string, string][] = [
      ['Commandes ce mois', siteOrders.length.toString()],
      ['Engagé ce mois', fmtMoney(stat.total)],
      ['Budget total', hasBudget ? fmtMoney(stat.budget_total!) : 'Non défini'],
      ['Budget engagé total', hasBudget ? fmtMoney(stat.budget_committed) : '—'],
      [hasBudget && remaining! < 0 ? '⚠️ Dépassement' : 'Restant', hasBudget ? fmtMoney(Math.abs(remaining!)) : '—'],
    ];
    const kpiCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    // Labels row 2, values row 3
    kpiPairs.forEach(([lbl, val], i) => {
      const col = kpiCols[i * 2] ?? kpiCols[i];
      const nextCol = kpiCols[i * 2 + 1];
      if (nextCol) ws.mergeCells(`${col}2:${nextCol}2`);
      ws.getCell(`${col}2`).value = lbl;
      ws.getCell(`${col}2`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      ws.getCell(`${col}2`).font = { bold: true, size: 9, color: { argb: 'FFCBD5E1' } };
      ws.getCell(`${col}2`).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.getRow(2).height = 18;

    if (pct !== null) {
      const budgetColor = pct >= 100 ? 'FFDC2626' : pct >= 80 ? 'FFEA580C' : pct >= 60 ? 'FFEAB308' : 'FF16A34A';
      ws.mergeCells('J2:J3');
      const pctCell = ws.getCell('J2');
      pctCell.value = pct / 100;
      pctCell.numFmt = '0%';
      pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: budgetColor } };
      pctCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      pctCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getColumn(10).width = 10;
    }

    // Headers row 4
    ws.getRow(3).height = 10;
    headerRow(ws, 4, ['Date', 'Produit', 'Qté', 'Unité', 'Fournisseur', 'Chantier', 'Prix unit.', 'Électricien', 'N° commande']);
    ws.autoFilter = { from: 'A4', to: 'I4' };

    // Data rows
    let rSite = 5;
    let siteMonthTotal = 0;
    // Group by supplier within this site
    const supGroups = new Map<string, any[]>();
    for (const o of siteOrders) {
      const sup = o.actual_supplier || 'lumen';
      if (!supGroups.has(sup)) supGroups.set(sup, []);
      supGroups.get(sup)!.push(o);
    }

    for (const o of siteOrders) {
      const sup = o.actual_supplier || 'lumen';
      const amount = (o.unit_price ?? 0) * o.quantity;
      siteMonthTotal += amount;
      dataRow(ws, rSite, [
        o.order_date,
        o.product,
        o.quantity,
        o.unit,
        SUPPLIER_LABEL[sup] || sup,
        o.job_site_name || '—',
        o.unit_price ?? null,
        o.electrician_name || '—',
        o.supplier_order_id || '—',
      ], SUPPLIER_FILL[sup], { 6: '#,##0.00" $"' });
      rSite++;
    }

    // Total row
    totalRow(ws, rSite, [
      '', `TOTAL — ${siteOrders.length} commandes`, '', '', '', '', siteMonthTotal, '', '',
    ], { 6: '#,##0.00" $"' });
    rSite += 2;

    // Mini supplier breakdown for this site
    hdr(ws, rSite, ['A','B','C','D'], 'Répartition par fournisseur pour ce projet');
    rSite++;
    headerRow(ws, rSite, ['Fournisseur', 'Nb commandes', 'Montant total', '% du projet']);
    rSite++;
    for (const [sup, supOrds] of supGroups) {
      const supTotal = supOrds.reduce((s: number, o: any) => s + (o.unit_price ?? 0) * o.quantity, 0);
      dataRow(ws, rSite, [
        SUPPLIER_LABEL[sup] || sup,
        supOrds.length,
        supTotal,
        siteMonthTotal > 0 ? supTotal / siteMonthTotal : 0,
      ], SUPPLIER_FILL[sup], { 2: '#,##0.00" $"', 3: '0.0%' });
      rSite++;
    }
    totalRow(ws, rSite, ['TOTAL', siteOrders.length, siteMonthTotal, 1],
      { 2: '#,##0.00" $"', 3: '0.0%' });
  }

  // ─── Write and return ─────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();

  const filename = `logicsupplies-commandes-${month}.xlsx`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
