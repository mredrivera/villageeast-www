import type { APIRoute } from 'astro';
import { loadReport } from '~/lib/realestate-data';

/** Per-lot market metrics used to color the community map for signed-in owners. */
export const GET: APIRoute = async ({ locals }) => {
  const report = await loadReport(locals.supabase);
  return new Response(JSON.stringify({ asOf: report.asOf, lots: report.lotMetrics }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
};
