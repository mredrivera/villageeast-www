import type { SupabaseClient } from '@supabase/supabase-js';
import { buildReport, type AssessRow, type FactRow, type LotRow, type SaleRow } from './realestate';

/** Reads every row, past PostgREST's per-request row cap. Runs with the member's own session (RLS). */
async function all<T>(db: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).order(columns.split(',')[0]!).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export const todayEastern = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

export async function loadReport(db: SupabaseClient) {
  const [lots, facts, sales, assessments] = await Promise.all([
    all<LotRow>(db, 'lots', 'id,kind,label,lot,section,address,acres,improved,waterfront'),
    all<FactRow>(db, 'lot_facts', 'lot_id,year_built,finished_sqft,sales_history_from'),
    all<SaleRow>(db, 'lot_sales', 'id,lot_id,sale_date,price,kind,seller_type,deal_key,bundle_size'),
    all<AssessRow>(db, 'lot_assessments', 'lot_id,assessed_on,effective_year,land_value,building_value,total_value'),
  ]);
  return buildReport({ lots: lots.map((l) => ({ ...l, acres: l.acres === null ? null : Number(l.acres) })), facts, sales, assessments, today: todayEastern() });
}
