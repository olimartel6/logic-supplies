import { requireSuperAdmin } from '@/lib/tenant';
import { importLumenCatalog, getCatalogStats } from '@/lib/lumen-catalog';
import { importCanacCatalog, getCanacCatalogStats } from '@/lib/canac-catalog';
import { importHomeDepotCatalog, getHomeDepotCatalogStats } from '@/lib/homedepot-catalog';
import { importGuillevinCatalog, getGuillevinCatalogStats } from '@/lib/guillevin-catalog';

const SUPERADMIN_COMPANY_ID = 0;
const SUPPLIERS = ['lumen', 'canac', 'homedepot', 'guillevin'] as const;

export async function POST() {
  const ctx = await requireSuperAdmin();
  if ('error' in ctx) return ctx.error;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let grandTotal = 0;
      const errors: string[] = [];

      for (const supplier of SUPPLIERS) {
        send({ supplier, started: true });
        try {
          let result: { total: number; error?: string };
          let stats: { count: number; lastSync: string | null };

          if (supplier === 'canac') {
            result = await importCanacCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
            stats = getCanacCatalogStats();
          } else if (supplier === 'homedepot') {
            result = await importHomeDepotCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
            stats = getHomeDepotCatalogStats();
          } else if (supplier === 'guillevin') {
            result = await importGuillevinCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
            stats = getGuillevinCatalogStats();
          } else {
            result = await importLumenCatalog((p) => send({ supplier, ...p }), SUPERADMIN_COMPANY_ID);
            stats = getCatalogStats();
          }

          grandTotal += result.total;
          if (result.error) errors.push(`${supplier}: ${result.error}`);
          send({ supplier, supplierDone: true, total: result.total, stats });
        } catch (err: any) {
          errors.push(`${supplier}: ${err.message}`);
          send({ supplier, supplierDone: true, total: 0, error: err.message });
        }
      }

      send({ done: true, grandTotal, errors: errors.length > 0 ? errors : undefined });
      controller.close();
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
