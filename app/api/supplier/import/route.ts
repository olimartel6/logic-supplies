import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { importLumenCatalog, getCatalogStats } from '@/lib/lumen-catalog';
import { importCanacCatalog, getCanacCatalogStats } from '@/lib/canac-catalog';
import { importHomeDepotCatalog, getHomeDepotCatalogStats } from '@/lib/homedepot-catalog';
import { importGuillevinCatalog, getGuillevinCatalogStats, enrichGuillevinPrices } from '@/lib/guillevin-catalog';
import { importJsvCatalog, getJsvCatalogStats } from '@/lib/jsv-catalog';
import { importWestburneCatalog, getWestburneCatalogStats } from '@/lib/westburne-catalog';
import { importBmrCatalog, getBmrCatalogStats } from '@/lib/bmr-catalog';
import { importNedcoCatalog, getNedcoCatalogStats } from '@/lib/nedco-catalog';
import { importFutechCatalog, getFutechCatalogStats } from '@/lib/futech-catalog';
import { importDeschenessCatalog, getDeschenessCatalogStats } from '@/lib/deschenes-catalog';
import { importRonaCatalog, getRonaCatalogStats } from '@/lib/rona-catalog';

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'worker') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const supplier = req.nextUrl.searchParams.get('supplier') || 'lumen';
  const companyId = ctx.companyId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let result: { total: number; error?: string };
        let stats: { count: number; lastSync: string | null };

        if (supplier === 'canac') {
          result = await importCanacCatalog((progress) => send(progress), companyId);
          stats = getCanacCatalogStats();
        } else if (supplier === 'homedepot') {
          result = await importHomeDepotCatalog((progress) => send(progress), companyId);
          stats = getHomeDepotCatalogStats();
        } else if (supplier === 'guillevin') {
          result = await importGuillevinCatalog((progress) => send(progress), companyId);
          send({ category: 'Enrichissement des prix...', imported: 0, total: 0, done: false });
          const enrichResult = await enrichGuillevinPrices(companyId!, (p) => send(p));
          if (enrichResult.error) send({ category: 'Prix', imported: 0, total: 0, done: true, error: enrichResult.error });
          result.total += enrichResult.updated;
          stats = getGuillevinCatalogStats();
        } else if (supplier === 'jsv') {
          result = await importJsvCatalog((progress) => send(progress), companyId);
          stats = getJsvCatalogStats();
        } else if (supplier === 'westburne') {
          result = await importWestburneCatalog((progress) => send(progress), companyId);
          stats = getWestburneCatalogStats();
        } else if (supplier === 'bmr') {
          result = await importBmrCatalog((progress) => send(progress), companyId);
          stats = getBmrCatalogStats();
        } else if (supplier === 'nedco') {
          result = await importNedcoCatalog((progress) => send(progress), companyId);
          stats = getNedcoCatalogStats();
        } else if (supplier === 'futech') {
          result = await importFutechCatalog((progress) => send(progress), companyId);
          stats = getFutechCatalogStats();
        } else if (supplier === 'deschenes') {
          result = await importDeschenessCatalog((progress) => send(progress), companyId);
          stats = getDeschenessCatalogStats();
        } else if (supplier === 'rona') {
          result = await importRonaCatalog((progress) => send(progress), companyId);
          stats = getRonaCatalogStats();
        } else {
          result = await importLumenCatalog((progress) => send(progress), companyId);
          stats = getCatalogStats();
        }

        send({ done: true, total: result.total, stats, error: result.error });
      } catch (err: any) {
        send({ done: true, total: 0, error: err.message });
      } finally {
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

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'worker') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const supplier = req.nextUrl.searchParams.get('supplier') || 'lumen';

  if (supplier === 'canac') return NextResponse.json(getCanacCatalogStats());
  if (supplier === 'homedepot') return NextResponse.json(getHomeDepotCatalogStats());
  if (supplier === 'guillevin') return NextResponse.json(getGuillevinCatalogStats());
  if (supplier === 'jsv') return NextResponse.json(getJsvCatalogStats());
  if (supplier === 'westburne') return NextResponse.json(getWestburneCatalogStats());
  if (supplier === 'bmr') return NextResponse.json(getBmrCatalogStats());
  if (supplier === 'nedco') return NextResponse.json(getNedcoCatalogStats());
  if (supplier === 'futech') return NextResponse.json(getFutechCatalogStats());
  if (supplier === 'deschenes') return NextResponse.json(getDeschenessCatalogStats());
  if (supplier === 'rona') return NextResponse.json(getRonaCatalogStats());
  return NextResponse.json(getCatalogStats());
}
