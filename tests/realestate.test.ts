import { describe, expect, it } from 'vitest';
import { buildReport, median, type AssessRow, type FactRow, type LotRow, type SaleRow } from '~/lib/realestate';

const lot = (id: string, over: Partial<LotRow> = {}): LotRow => ({ id, kind: 'lot', label: `Lot ${id}`, lot: id, section: '1', address: `${id} Test Road`, acres: 1, improved: false, ...over });
const fact = (lot_id: string, year_built: number | null, over: Partial<FactRow> = {}): FactRow => ({ lot_id, year_built, finished_sqft: year_built ? 2000 : null, sales_history_from: null, ...over });
let n = 0;
const sale = (lot_id: string, sale_date: string, price: number | null, over: Partial<SaleRow> = {}): SaleRow => ({
  lot_id, sale_date, price, kind: price === null ? 'historic' : price >= 1000 ? 'market' : 'nominal', seller_type: 'individual', deal_key: `k${n++}`, bundle_size: 1, ...over,
});

const lots = [lot('a', { improved: true, waterfront: true }), lot('b', { improved: true }), lot('c'), lot('d'), lot('e'), lot('f', { improved: true }), lot('gb', { kind: 'greenbelt' })];
const facts = [fact('a', 2005), fact('b', 2024), fact('c', null), fact('d', null, { sales_history_from: '2018-03-01' }), fact('e', null), fact('f', 2021)];
const sales: SaleRow[] = [
  sale('a', '2010-05-01', 200000),                   // home sale (built 2005)
  sale('a', '2020-05-01', 300000),                   // resale: +4.1%/yr
  sale('b', '2022-03-01', 40000),                    // sold as a lot (house built 2024)
  sale('b', '2024-08-01', 650000, { seller_type: 'company' }), // new construction
  sale('c', '1995-01-01', null),
  sale('f', '2021-02-01', 30000),                    // bare lot sold in the year its house was built                     // conversion record only: idle 30+ years
  sale('d', '2018-03-01', 100),                      // nominal transfer
  sale('d', '2025-09-01', 55000, { deal_key: 'pkg', bundle_size: 2 }), // sold together with e
  sale('e', '2025-09-01', 55000, { deal_key: 'pkg', bundle_size: 2 }),
];
const assessments: AssessRow[] = [
  { lot_id: 'a', assessed_on: '2019-01-01', effective_year: 2019, land_value: 50000, building_value: 200000, total_value: 250000 },
  { lot_id: 'a', assessed_on: '2023-01-01', effective_year: 2023, land_value: 60000, building_value: 240000, total_value: 300000 },
  { lot_id: 'c', assessed_on: '2023-01-01', effective_year: 2023, land_value: 20000, building_value: 0, total_value: 20000 },
];
const r = buildReport({ lots, facts, sales, assessments, today: '2026-06-30', firstYear: 2010 });

describe('real estate report', () => {
  it('counts only lots, and the share that is developed', () => {
    expect(r.totals).toMatchObject({ lots: 6, homes: 3, vacant: 3, developedShare: 0.5 });
  });
  it('turns one deed for two lots into one deal, and classifies deals by what stood on the lot', () => {
    expect(r.deals).toHaveLength(6);
    const byDate = Object.fromEntries(r.deals.map((d) => [d.date, d]));
    expect(byDate['2010-05-01']!.type).toBe('home');
    expect(byDate['2022-03-01']!.type).toBe('lot');
    expect(byDate['2024-08-01']!.type).toBe('new_build');
    expect(byDate['2021-02-01']!.type).toBe('lot');
    expect(byDate['2025-09-01']!.lots).toHaveLength(2);
    expect(byDate['2025-09-01']!.name).toMatch(/\+ 1 adjoining lot/);
  });
  it('computes appreciation only between comparable sales', () => {
    const resale = r.deals.find((d) => d.date === '2020-05-01')!;
    expect(resale.prev?.price).toBe(200000);
    expect(resale.annualGrowth).toBeCloseTo(4.1, 1);
    // b sold as a lot, then with a new house: not an appreciation pair
    expect(r.deals.find((d) => d.date === '2024-08-01')!.prev).toBeNull();
  });
  it('reports velocity and data completeness by year', () => {
    const y2017 = r.velocity.find((v) => v.year === 2017)!;
    const y2025 = r.velocity.find((v) => v.year === 2025)!;
    expect(y2017.coverage).toBe(0.833); // lot d's record starts in 2018 (5 of 6 lots complete)
    expect(y2025).toMatchObject({ total: 1, lot: 1, lotsSold: 2, coverage: 1 });
    expect(r.velocity.at(-1)!.partial).toBe(true);
    expect(r.last12.deals).toBe(1);
  });
  it('finds idle lots, flags approximate dates and lots bought with a neighbor', () => {
    const c = r.idle.find((x) => x.id === 'c')!;
    expect(c).toMatchObject({ heldSinceApprox: true, lastMarket: null, assessed: 20000 });
    expect(c.yearsHeld).toBeGreaterThan(31);
    expect(r.idle[0]!.id).toBe('c'); // longest held first
    expect(r.idleLongHeld).toBe(1);
    expect(r.idleBuckets.reduce((t, b) => t + b.lots, 0)).toBe(3);
  });
  it('builds the build-out curve and assessment cycles', () => {
    expect(r.buildOut.find((b) => b.year === 2024)).toMatchObject({ built: 1, homes: 3, share: 0.5 });
    const c2019 = r.cycles.find((c) => c.year === 2019)!;
    const c2023 = r.cycles.find((c) => c.year === 2023)!;
    expect(c2019).toMatchObject({ known: 1, complete: false, total: 250000 });
    expect(c2023).toMatchObject({ known: 2, medianHome: 300000, medianLot: 20000 });
  });
  it('excludes green belts and other common areas', () => {
    expect(Object.keys(r.lotMetrics)).not.toContain('gb');
    expect(r.lotMetrics.a).toEqual({ lastSale: 2020, heldSince: 2020, vacant: false, waterfront: true });
  });
  it('splits recent prices into waterfront and off-water segments', () => {
    const seg = Object.fromEntries(r.segments.map((x) => [x.label, x]));
    expect(seg['Off-water homes']).toMatchObject({ sales: 1, median: 650000, perUnit: 325, unit: 'sq ft' });
    expect(seg['Waterfront homes']!.sales).toBe(0); // its last sale is older than 3 years
    expect(seg['Off-water lots']!.sales).toBe(0);   // bundled sales are left out of per-lot prices
    expect(r.totals.waterfront).toBe(1);
  });
  it('median handles even, odd and empty input', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
