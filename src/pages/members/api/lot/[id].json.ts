import type { APIRoute } from 'astro';

/** Owner-of-record, property facts, last sale and assessment for one lot. Middleware guarantees an approved member; RLS enforces it again. */
export const GET: APIRoute = async ({ params, locals }) => {
  const id = params.id ?? '';
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return new Response('Not found', { status: 404 });
  const db = locals.supabase;
  const [{ data: facts }, { data: sale }, { data: assessment }] = await Promise.all([
    db.from('lot_facts').select('owner_names,year_built,finished_sqft,stories,bedrooms,full_baths,half_baths,building_style,exterior,owner_since_year').eq('lot_id', id).maybeSingle(),
    db.from('lot_sales').select('sale_date,price,bundle_size').eq('lot_id', id).eq('kind', 'market').order('sale_date', { ascending: false }).limit(1).maybeSingle(),
    db.from('lot_assessments').select('assessed_on,total_value').eq('lot_id', id).order('assessed_on', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return new Response(JSON.stringify({ ...(facts ?? {}), last_sale: sale ?? null, assessment: assessment ?? null }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
};
