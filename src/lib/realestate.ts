/**
 * Real estate analytics for Village East, computed from Bedford County's public records
 * (deed transfers, assessments and building records). Pure functions: no I/O, so they are unit
 * tested and run on the server for the members-only page.
 *
 * Data caveat the county imposes: each parcel keeps only its 3 most recent transfers. `coverage`
 * reports, for each year, the share of lots whose record reaches back that far, so charts can flag
 * years that are undercounted.
 */
export type LotRow = { id: string; kind: string; label: string; lot: string | null; section: string | null; address: string | null; acres: number | null; improved: boolean; waterfront?: boolean };
export type FactRow = { lot_id: string; year_built: number | null; finished_sqft: number | null; sales_history_from: string | null };
export type SaleRow = { lot_id: string; sale_date: string; price: number | null; kind: 'market' | 'nominal' | 'historic'; seller_type: string; deal_key: string; bundle_size: number };
export type AssessRow = { lot_id: string; assessed_on: string; effective_year: number; land_value: number; building_value: number; total_value: number };

export type DealType = 'home' | 'new_build' | 'lot';
export type Deal = {
  key: string;
  date: string;
  year: number;
  price: number;
  type: DealType;
  sellerType: string;
  lots: { id: string; name: string; acres: number | null }[];
  name: string;
  waterfront: boolean;
  acres: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  pricePerSqft: number | null;
  pricePerAcre: number | null;
  /** Previous market sale of the same lot, when comparable (same lot, same kind of property). */
  prev: { date: string; price: number } | null;
  annualGrowth: number | null;
};
export type IdleLot = { id: string; name: string; waterfront: boolean; acres: number | null; heldSince: string | null; heldSinceApprox: boolean; yearsHeld: number | null; lastMarket: { date: string; price: number } | null; withNeighbor: boolean; assessed: number | null };
export type Report = ReturnType<typeof buildReport>;

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
export const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / YEAR_MS;
export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}
const round = (n: number | null, digits = 0) => (n === null ? null : Number(n.toFixed(digits)));
const lotName = (l: LotRow) => l.address ?? `Section ${l.section ?? '?'}, ${l.label}`;

export const ASSESSMENT_CYCLES = [2007, 2011, 2015, 2019, 2023] as const;

export function buildReport(input: { lots: LotRow[]; facts: FactRow[]; sales: SaleRow[]; assessments: AssessRow[]; today: string; firstYear?: number }) {
  const { today } = input;
  const firstYear = input.firstYear ?? 2000;
  const thisYear = Number(today.slice(0, 4));
  const lots = input.lots.filter((l) => l.kind === 'lot');
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const factById = new Map(input.facts.map((f) => [f.lot_id, f]));
  const yearBuilt = (id: string) => factById.get(id)?.year_built ?? null;
  const salesByLot = groupBy(input.sales.filter((s) => lotById.has(s.lot_id)), (s) => s.lot_id);
  for (const list of salesByLot.values()) list.sort((a, b) => a.sale_date.localeCompare(b.sale_date));

  // ---- Deals: one per deed, even when a deed conveys several lots -------------------------------
  const marketRows = input.sales.filter((s) => s.kind === 'market' && s.price && lotById.has(s.lot_id));
  const deals: Deal[] = [];
  for (const [key, rows] of groupBy(marketRows, (s) => `${s.deal_key}`)) {
    const first = rows[0]!;
    const year = Number(first.sale_date.slice(0, 4));
    const dealLots = rows.map((r) => lotById.get(r.lot_id)!);
    // Classify by whether a house stood on any of the lots when the deed was recorded.
    const built = dealLots.map((l) => yearBuilt(l.id)).filter((y): y is number => y !== null && y <= year);
    let type: DealType = 'lot';
    if (built.length) {
      const yb = Math.max(...built);
      const price = first.price!;
      if (year - yb <= 1 && first.seller_type === 'company') type = 'new_build'; // builder selling a finished house
      else if (yb === year) type = price < 100000 ? 'lot' : 'new_build'; // same-year sale: a cheap one was the bare lot
      else type = 'home';
    }
    const homeLot = dealLots.find((l) => { const y = yearBuilt(l.id); return y !== null && y <= year; });
    const acres = dealLots.reduce((t, l) => t + (l.acres ?? 0), 0) || null;
    const sqft = homeLot ? factById.get(homeLot.id)?.finished_sqft ?? null : null;
    const single = rows.length === 1;
    const price = first.price!;
    let prev: Deal['prev'] = null;
    if (single) {
      const history = (salesByLot.get(first.lot_id) ?? []).filter((s) => s.kind === 'market' && s.price && s.bundle_size === 1 && s.sale_date < first.sale_date);
      const p = history[history.length - 1];
      if (p) {
        const pYear = Number(p.sale_date.slice(0, 4));
        const yb = yearBuilt(first.lot_id);
        const prevHadHome = yb !== null && yb <= pYear;
        // Only compare like with like: a lot that later gained a house is not "appreciation".
        if (prevHadHome === (type !== 'lot')) prev = { date: p.sale_date, price: p.price! };
      }
    }
    const span = prev ? yearsBetween(prev.date, first.sale_date) : 0;
    deals.push({
      key, date: first.sale_date, year, price, type, sellerType: first.seller_type,
      waterfront: dealLots.some((l) => !!l.waterfront),
      lots: dealLots.map((l) => ({ id: l.id, name: lotName(l), acres: l.acres })),
      name: (homeLot ? lotName(homeLot) : lotName(dealLots[0]!)) + (rows.length > 1 ? ` + ${rows.length - 1} adjoining lot${rows.length > 2 ? 's' : ''}` : ''),
      acres, sqft, yearBuilt: homeLot ? yearBuilt(homeLot.id) : null,
      pricePerSqft: type !== 'lot' && sqft ? round(price / sqft) : null,
      pricePerAcre: type === 'lot' && acres ? round(price / acres) : null,
      prev,
      annualGrowth: prev && span >= 1 ? round((Math.pow(price / prev.price, 1 / span) - 1) * 100, 1) : null,
    });
  }
  deals.sort((a, b) => b.date.localeCompare(a.date));

  // ---- Coverage: how complete is the county's record for each year? ----------------------------
  const coverage = (year: number) => {
    const ok = lots.filter((l) => { const from = factById.get(l.id)?.sales_history_from; return !from || Number(from.slice(0, 4)) <= year; }).length;
    return lots.length ? ok / lots.length : 0;
  };

  // ---- Velocity ------------------------------------------------------------------------------
  const velocity = range(firstYear, thisYear).map((year) => {
    const d = deals.filter((x) => x.year === year);
    const count = (t: DealType) => d.filter((x) => x.type === t).length;
    return {
      year, home: count('home'), new_build: count('new_build'), lot: count('lot'), total: d.length,
      lotsSold: d.reduce((t, x) => t + x.lots.length, 0),
      coverage: round(coverage(year), 3)!, partial: year === thisYear,
      medianHome: round(median(d.filter((x) => x.type !== 'lot' && x.lots.length === 1).map((x) => x.price))),
      medianLot: round(median(d.filter((x) => x.type === 'lot' && x.lots.length === 1).map((x) => x.price))),
    };
  });
  const completeFrom = velocity.find((v) => v.coverage >= 0.9)?.year ?? thisYear;
  const ago = (months: number) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - months); return d.toISOString().slice(0, 10); };
  const window = (fromMonths: number, toMonths: number) => deals.filter((x) => x.date > ago(fromMonths) && x.date <= ago(toMonths));
  const summarize = (list: Deal[]) => ({
    deals: list.length,
    homes: list.filter((x) => x.type !== 'lot').length,
    lots: list.filter((x) => x.type === 'lot').length,
    medianHome: round(median(list.filter((x) => x.type !== 'lot' && x.lots.length === 1).map((x) => x.price))),
    medianLot: round(median(list.filter((x) => x.type === 'lot' && x.lots.length === 1).map((x) => x.price))),
    medianHomePerSqft: round(median(list.map((x) => x.pricePerSqft ?? NaN))),
    volume: list.reduce((t, x) => t + x.price, 0),
  });
  // Waterfront and off-water property are different markets: compare them separately (last 3 years).
  const segmentWindow = window(36, 0).filter((x) => x.lots.length === 1);
  const segment = (label: string, waterfront: boolean, home: boolean) => {
    const list = segmentWindow.filter((x) => x.waterfront === waterfront && (x.type !== 'lot') === home);
    return {
      label, waterfront, home, sales: list.length,
      median: round(median(list.map((x) => x.price))),
      low: list.length ? Math.min(...list.map((x) => x.price)) : null,
      high: list.length ? Math.max(...list.map((x) => x.price)) : null,
      perUnit: round(median(list.map((x) => (home ? x.pricePerSqft : x.pricePerAcre) ?? NaN))),
      unit: home ? 'sq ft' : 'acre',
    };
  };
  const segments = [segment('Waterfront homes', true, true), segment('Off-water homes', false, true), segment('Waterfront lots', true, false), segment('Off-water lots', false, false)];
  const last12 = summarize(window(12, 0));
  const prior12 = summarize(window(24, 12));
  const last24 = summarize(window(24, 0));
  // Average market sales per year over the last 5 complete years, as a share of all lots.
  const recentYears = velocity.filter((v) => !v.partial).slice(-5);
  const turnoverRate = recentYears.length && lots.length ? recentYears.reduce((t, v) => t + v.lotsSold, 0) / recentYears.length / lots.length : 0;

  // ---- Holding periods between consecutive sales of the same lot ------------------------------
  const holds: number[] = [];
  for (const list of salesByLot.values()) {
    const dated = list.filter((s) => s.kind !== 'historic');
    for (let i = 1; i < dated.length; i++) if (dated[i]!.kind === 'market') holds.push(yearsBetween(dated[i - 1]!.sale_date, dated[i]!.sale_date));
  }

  // ---- Development / build-out ----------------------------------------------------------------
  const builtYears = lots.map((l) => yearBuilt(l.id)).filter((y): y is number => y !== null && y > 1900);
  const homesNow = lots.filter((l) => l.improved || yearBuilt(l.id) !== null).length;
  const buildStart = builtYears.length ? Math.min(...builtYears) : thisYear;
  const buildOut = range(buildStart, thisYear).map((year) => {
    const homes = builtYears.filter((y) => y <= year).length;
    return { year, built: builtYears.filter((y) => y === year).length, homes, share: round(homes / lots.length, 3)! };
  });
  const byDecade = groupBy(builtYears, (y) => `${Math.floor(y / 10) * 10}s`);
  const buildDecades = [...byDecade].map(([decade, ys]) => ({ decade, homes: ys.length })).sort((a, b) => a.decade.localeCompare(b.decade));

  // ---- Assessments -----------------------------------------------------------------------------
  const assessByLot = groupBy(input.assessments.filter((a) => lotById.has(a.lot_id)), (a) => a.lot_id);
  for (const list of assessByLot.values()) list.sort((a, b) => a.assessed_on.localeCompare(b.assessed_on));
  const valueIn = (id: string, year: number) => {
    const list = (assessByLot.get(id) ?? []).filter((a) => a.effective_year <= year);
    return list[list.length - 1] ?? null;
  };
  const latestAssessment = (id: string) => { const l = assessByLot.get(id); return l?.[l.length - 1] ?? null; };
  const cycles = ASSESSMENT_CYCLES.map((year) => {
    const vals = lots.map((l) => valueIn(l.id, year)).filter((a): a is AssessRow => a !== null);
    const homes = vals.filter((a) => a.building_value > 0);
    const vacant = vals.filter((a) => a.building_value === 0);
    return {
      year,
      known: vals.length,
      complete: vals.length === lots.length,
      total: vals.reduce((t, a) => t + a.total_value, 0),
      land: vals.reduce((t, a) => t + a.land_value, 0),
      buildings: vals.reduce((t, a) => t + a.building_value, 0),
      medianHome: round(median(homes.map((a) => a.total_value))),
      medianLot: round(median(vacant.map((a) => a.total_value))),
      homes: homes.length,
    };
  });
  // Price relative to the assessment in effect when it sold (above 1 = selling above assessment).
  const ratios = deals
    .filter((d) => d.lots.length === 1 && d.date > ago(36))
    .map((d) => { const a = valueIn(d.lots[0]!.id, d.year); return a && a.total_value > 0 ? d.price / a.total_value : NaN; });

  // ---- Idle (vacant) lots ----------------------------------------------------------------------
  const homeLotIds = new Set(lots.filter((l) => l.improved || yearBuilt(l.id) !== null).map((l) => l.id));
  const dealsByLot = new Map<string, Deal[]>();
  for (const d of deals) for (const l of d.lots) dealsByLot.set(l.id, [...(dealsByLot.get(l.id) ?? []), d]);
  const idle: IdleLot[] = lots.filter((l) => !homeLotIds.has(l.id)).map((l) => {
    const list = salesByLot.get(l.id) ?? [];
    const latest = list[list.length - 1] ?? null;
    const market = dealsByLot.get(l.id)?.[0] ?? null; // deals are sorted newest first
    return {
      id: l.id, name: lotName(l), waterfront: !!l.waterfront, acres: l.acres,
      heldSince: latest?.sale_date ?? null,
      heldSinceApprox: latest?.kind === 'historic',
      yearsHeld: latest ? round(yearsBetween(latest.sale_date, today), 1) : null,
      lastMarket: market ? { date: market.date, price: market.price } : null,
      // Bought together with a neighboring house: usually a side yard rather than a building lot.
      withNeighbor: !!market && market.lots.some((x) => homeLotIds.has(x.id)),
      assessed: latestAssessment(l.id)?.total_value ?? null,
    };
  }).sort((a, b) => (b.yearsHeld ?? 99) - (a.yearsHeld ?? 99));
  const idleBuckets = [
    { label: 'Under 5 years', min: 0, max: 5 }, { label: '5-10 years', min: 5, max: 10 },
    { label: '10-20 years', min: 10, max: 20 }, { label: '20-30 years', min: 20, max: 30 }, { label: '30+ years', min: 30, max: Infinity },
  ].map((b) => ({ label: b.label, lots: idle.filter((x) => (x.yearsHeld ?? 99) >= b.min && (x.yearsHeld ?? 99) < b.max).length }));

  // ---- Per-lot metrics for coloring the community map ----------------------------------------
  const lotMetrics = Object.fromEntries(lots.map((l) => {
    const list = salesByLot.get(l.id) ?? [];
    const latest = list[list.length - 1];
    const market = dealsByLot.get(l.id)?.[0];
    return [l.id, {
      lastSale: market ? market.year : null,
      heldSince: latest ? Number(latest.sale_date.slice(0, 4)) : null,
      vacant: !homeLotIds.has(l.id),
      waterfront: !!l.waterfront,
    }];
  }));

  return {
    asOf: today,
    totals: {
      lots: lots.length, homes: homesNow, vacant: lots.length - homesNow,
      waterfront: lots.filter((l) => l.waterfront).length,
      vacantWaterfront: lots.filter((l) => l.waterfront && !homeLotIds.has(l.id)).length,
      developedShare: lots.length ? round(homesNow / lots.length, 3)! : 0,
      vacantAcres: round(lots.filter((l) => !homeLotIds.has(l.id)).reduce((t, l) => t + (l.acres ?? 0), 0), 1)!,
      marketSales: deals.length,
    },
    last12, prior12, last24, segments,
    turnoverRate: round(turnoverRate, 3)!,
    medianHoldYears: round(median(holds), 1),
    completeFrom,
    velocity,
    deals,
    recent: deals.filter((d) => d.date > ago(24)),
    buildOut, buildDecades,
    cycles,
    saleToAssessment: round(median(ratios), 2),
    saleToAssessmentN: ratios.filter(Number.isFinite).length,
    idle, idleBuckets,
    idleLongHeld: idle.filter((x) => (x.yearsHeld ?? 99) >= 20 && !x.withNeighbor).length,
    lotMetrics,
  };
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) { const k = key(it); const list = m.get(k); if (list) list.push(it); else m.set(k, [it]); }
  return m;
}
function range(from: number, to: number) { return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i); }
