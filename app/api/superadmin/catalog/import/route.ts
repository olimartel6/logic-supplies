import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/tenant';
import { importLumenCatalog, getCatalogStats } from '@/lib/lumen-catalog';
import { importCanacCatalog, getCanacCatalogStats } from '@/lib/canac-catalog';
import { importHomeDepotCatalog, getHomeDepotCatalogStats } from '@/lib/homedepot-catalog';
import { importGuillevinCatalog, getGuillevinCatalogStats } from '@/lib/guillevin-catalog';

const SUPERADMIN_COMPANY_ID = 0;

export async function GET(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const supplier = req.nextUrl.searchParams.get('supplier') || 'lumen';
  if (supplier === 'canac') return NextResponse.json(getCanacCatalogStats());
  if (supplier === 'homedepot') return NextResponse.json(getHomeDepotCatalogStats());
  if (supplier === 'guillevin') return NextResponse.json(getGuillevinCatalogStats());
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
        } else {
          result = await importLumenCatalog((p) => send(p), SUPERADMIN_COMPANY_ID);
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
