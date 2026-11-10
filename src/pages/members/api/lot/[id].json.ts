import type { APIRoute } from 'astro';

/** Owner-of-record and property facts for one lot. Middleware guarantees an approved member; RLS enforces it again. */
export const GET: APIRoute = async ({ params, locals }) => {
  const id = params.id ?? '';
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return new Response('Not found', { status: 404 });
  const { data } = await locals.supabase.from('lot_facts')
    .select('owner_names,year_built,finished_sqft,stories,bedrooms,full_baths,half_baths,building_style,exterior,owner_since_year')
    .eq('lot_id', id).maybeSingle();
  return new Response(JSON.stringify(data ?? {}), { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
};
