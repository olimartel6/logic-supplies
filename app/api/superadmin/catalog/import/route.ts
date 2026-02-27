import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/tenant';
import { importLumenCatalog, getCatalogStats } from '@/lib/lumen-catalog';
import { importCanacCatalog, getCanacCatalogStats } from '@/lib/canac-catalog';
import { importHomeDepotCatalog, getHomeDepotCatalogStats } from '@/lib/homedepot-catalog';
import { importGuillevinCatalog, getGuillevinCatalogStats } from '@/lib/guillevin-catalog';
import { importJsvCatalog, getJsvCatalogStats } from '@/lib/jsv-catalog';
import { importWestburneCatalog, getWestburneCatalogStats } from '@/lib/westburne-catalog';
import { importNedcoCatalog, getNedcoCatalogStats } from '@/lib/nedco-catalog';
import { importFutechCatalog, getFutechCatalogStats } from '@/lib/futech-catalog';
import { importDeschenessCatalog, getDeschenessCatalogStats } from '@/lib/deschenes-catalog';
import { importBmrCatalog, getBmrCatalogStats } from '@/lib/bmr-catalog';
import { importRonaCatalog, getRonaCatalogStats } from '@/lib/rona-catalog';

const SUPERADMIN_COMPANY_ID = 0;

export async function GET(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const supplier = req.nextUrl.searchParams.get('supplier') || 'lumen';
  if (supplier === 'canac')     return NextResponse.json(getCanacCatalogStats());
  if (supplier === 'homedepot') return NextResponse.json(getHomeDepotCatalogStats());
  if (supplier === 'guillevin') return NextResponse.json(getGuillevinCatalogStats());
  if (supplier === 'jsv')       return NextResponse.json(getJsvCatalogStats());
  if (supplier === 'westburne') return NextResponse.json(getWestburneCatalogStats());
  if (supplier === 'nedco')     return NextResponse.json(getNedcoCatalogStats());
  if (supplier === 'futech')    return NextResponse.json(getFutechCatalogStats());
  if (supplier === 'deschenes') return NextResponse.json(getDeschenessCatalogStats());
  if (supplier === 'bmr')       return NextResponse.json(getBmrCatalogStats());
  if (supplier === 'rona')      return NextResponse.json(getRonaCatalogStats());
  return NextResponse.json(getCatalogStats());
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const supplier = req.nextUrl.searchParams.get('supplier') || 'lumen';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Send keepalive pings every 20s to prevent Railway proxy 502 timeout
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')); } catch {}
      }, 20000);

      try {
        let result: { total: number; error?: string };
        let stats: { count: number; lastSync: string | null };

        if (supplier === 'canac') {
          result = await importCanacCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getCanacCatalogStats();
        } else if (supplier === 'homedepot') {
          result = await importHomeDepotCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getHomeDepotCatalogStats();
        } else if (supplier === 'guillevin') {
          result = await importGuillevinCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getGuillevinCatalogStats();
        } else if (supplier === 'jsv') {
          result = await importJsvCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getJsvCatalogStats();
        } else if (supplier === 'westburne') {
          result = await importWestburneCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getWestburneCatalogStats();
        } else if (supplier === 'nedco') {
          result = await importNedcoCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getNedcoCatalogStats();
        } else if (supplier === 'futech') {
          result = await importFutechCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getFutechCatalogStats();
        } else if (supplier === 'deschenes') {
          result = await importDeschenessCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getDeschenessCatalogStats();
        } else if (supplier === 'bmr') {
          result = await importBmrCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getBmrCatalogStats();
        } else if (supplier === 'rona') {
          result = await importRonaCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getRonaCatalogStats();
        } else {
          result = await importLumenCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
          stats = getCatalogStats();
        }

        send({ done: true, total: result.total, stats, error: result.error });
      } catch (err: any) {
        send({ done: true, total: 0, error: err.message });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
