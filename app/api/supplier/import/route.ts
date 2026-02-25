import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { importLumenCatalog, getCatalogStats } from '@/lib/lumen-catalog';
import { importCanacCatalog, getCanacCatalogStats } from '@/lib/canac-catalog';
import { importHomeDepotCatalog, getHomeDepotCatalogStats } from '@/lib/homedepot-catalog';
import { importGuillevinCatalog, getGuillevinCatalogStats } from '@/lib/guillevin-catalog';

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'electrician') {
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
          stats = getGuillevinCatalogStats();
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
  if (ctx.role === 'electrician') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const supplier = req.nextUrl.searchParams.get('supplier') || 'lumen';

  if (supplier === 'canac') return NextResponse.json(getCanacCatalogStats());
  if (supplier === 'homedepot') return NextResponse.json(getHomeDepotCatalogStats());
  if (supplier === 'guillevin') return NextResponse.json(getGuillevinCatalogStats());
  return NextResponse.json(getCatalogStats());
}
