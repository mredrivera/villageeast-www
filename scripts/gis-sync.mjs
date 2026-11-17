#!/usr/bin/env node
/**
 * Pulls Village East data from Bedford County's public GIS (ArcGIS REST) and writes:
 *
 *   public/data/map/parcels.geojson   PUBLIC  - lot outlines, lot/section numbers, street address, acreage
 *   public/data/map/context.geojson   PUBLIC  - roads, building footprints, shoreline for the map backdrop
 *   src/data/community-facts.json     PUBLIC  - fire/rescue district, schools, voting precinct, etc.
 *   supabase/seed/generated/lot_facts.json        PRIVATE (gitignored) - owner name + property facts
 *   supabase/seed/generated/lot_sales.json        PRIVATE (gitignored) - recorded deed transfers (date, price)
 *   supabase/seed/generated/lot_assessments.json  PRIVATE (gitignored) - county assessments (last 5 records)
 *       The PRIVATE files are loaded into members-only tables by `npm run seed`.
 *
 * Deliberately NOT collected: owner mailing addresses, and the names of sellers or buyers on transfers
 * (only a coarse seller type such as "builder" or "lender" is kept).
 *
 * Usage: node scripts/gis-sync.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://webgis.bedfordcountyva.gov/arcgis/rest/services/OpenData';
const LAYERS = {
  parcels: `${BASE}/OpenDataProperty/MapServer/0`,
  improvements: `${BASE}/OpenDataProperty/MapServer/7`,
  landRecords: `${BASE}/OpenDataProperty/MapServer/8`,
  valuations: `${BASE}/OpenDataProperty/MapServer/9`,
  roads: `${BASE}/OpenDataReference/MapServer/4`,
  buildings: `${BASE}/OpenDataReference/MapServer/2`,
  water: `${BASE}/OpenDataHydrology/MapServer/1`,
  fireDistrict: `${BASE}/OpenDataPublicSafety/MapServer/3`,
  rescueDistrict: `${BASE}/OpenDataPublicSafety/MapServer/2`,
  fireStations: `${BASE}/OpenDataPublicSafety/MapServer/0`,
  rescueSquads: `${BASE}/OpenDataPublicSafety/MapServer/1`,
  elementary: `${BASE}/OpenDataSchools/MapServer/1`,
  middle: `${BASE}/OpenDataSchools/MapServer/2`,
  high: `${BASE}/OpenDataSchools/MapServer/3`,
  precinct: `${BASE}/OpenDataVoting/MapServer/1`,
  votingDistrict: `${BASE}/OpenDataVoting/MapServer/2`,
  collection: `${BASE}/OpenDataFacilities/MapServer/0`,
  zoning: `${BASE}/OpenDataProperty/MapServer/3`,
};

async function query(layer, params, { all = true, table = false } = {}) {
  const out = [];
  let offset = 0;
  for (;;) {
    const body = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      ...(table ? { f: 'json' } : { outSR: '4326', geometryPrecision: '6', f: 'geojson' }),
      resultOffset: String(offset),
      ...params,
    });
    const res = await fetch(`${layer}/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'gis-sync/1.0' },
      body,
    });
    if (!res.ok) throw new Error(`${layer} -> HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`${layer} -> ${JSON.stringify(json.error)}`);
    // Attribute-only tables come back as Esri JSON; normalise to the GeoJSON property shape.
    const features = (json.features ?? []).map((f) => (table ? { properties: f.attributes } : f));
    out.push(...features);
    const more = json.exceededTransferLimit || json.properties?.exceededTransferLimit;
    if (!all || !more || features.length === 0) break;
    offset += features.length;
  }
  return out;
}

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v);
const SUFFIX = { DR: 'Drive', RD: 'Road', LN: 'Lane', CT: 'Court', TRL: 'Trail' };
function titleCase(s) {
  return clean(s ?? '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Dr|Rd|Ln|Ct|Trl)\b\.?$/i, (m) => SUFFIX[m.toUpperCase().replace('.', '')] ?? m);
}
/** "SMITH JOHN A & MARY B" -> "John A & Mary B Smith" is error-prone; keep county order, just fix the casing. */
function ownerCase(s) {
  return clean(s ?? '')
    .toLowerCase()
    .replace(/(^|[\s\-'&/])([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\b(Llc|Lp|Ii|Iii|Iv|Jr|Sr|Tr|Trs|Poa)\b/g, (m) => (/^(Jr|Sr)$/.test(m) ? m : m.toUpperCase()));
}
const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

// ---------------------------------------------------------------------------------------------
// Deed transfers and assessments
// ---------------------------------------------------------------------------------------------
/** "07/14/2026" -> "2026-07-14" */
function isoDate(v) {
  const m = clean(v ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}
const money = (v) => { const n = Number(clean(String(v ?? '')).replace(/[^0-9]/g, '')); return Number.isFinite(n) ? n : 0; };

/** Coarse seller category: names are never stored. */
function sellerType(name) {
  const g = clean(name ?? '').toUpperCase();
  if (!g) return 'unknown';
  if (/VILLAGE EAST PROPERTY/.test(g)) return 'association';
  if (/\b(BANK|MORTGAGE|FEDERAL HOME|FANNIE|FREDDIE|SECRETARY OF|HOUSING AND URBAN|LOAN|SAVINGS|CREDIT UNION|NATIONAL TRUST CO)\b/.test(g)) return 'lender';
  if (/\b(LLC|INC|CORP|CORPORATION|CONSTRUCTION|CONTRACTING|BUILDERS?|HOMES|DEVELOP\w*|PROPERTIES|INVESTMENTS?|GROUP|LTD|PARTNERS|REALTY|REAL ESTATE|COMPANY)\b/.test(g)) return 'company';
  if (/\b(TRUST|TRUSTEE|ESTATE|EXECUTOR|EXR|ADMR)\b/.test(g)) return 'trust_or_estate';
  return 'individual';
}

function transferHistoryFrom(lr) {
  if (!lr || !clean(lr.Sale3D)) return null; // fewer than 3 transfers recorded: the record is complete
  return [1, 2, 3].map((i) => isoDate(lr[`Sale${i}D`])).filter(Boolean).sort()[0] ?? null;
}

function transfersFor(lotId, lr) {
  if (!lr) return [];
  const out = [];
  const seen = new Set();
  for (const i of [1, 2, 3]) {
    const date = isoDate(lr[`Sale${i}D`]);
    if (!date) continue;
    const price = money(lr[`Sale${i}Amt`]);
    const key = `${date}|${price}`;
    if (seen.has(key)) continue; // the county often repeats a conversion record in two slots
    seen.add(key);
    const deed = clean(lr[`Doc${i}Num`]) || clean(lr[`Doc${i}Ref`]) || null;
    // Records dated 1 January with no price come from the county's conversion to computer records
    // (and the developer's original conveyances); their real date is unknown.
    const historic = price === 0 && date.endsWith('-01-01') && Number(date.slice(0, 4)) <= 1997;
    out.push({
      lot_id: lotId,
      sale_date: date,
      price: price || null,
      kind: historic ? 'historic' : price >= 1000 ? 'market' : 'nominal',
      seller_type: sellerType(lr[`GrantorName${i}`]),
      deed_ref: deed,
      deal_key: `${date}|${price}|${deed ?? ''}`,
      bundle_size: 1,
    });
  }
  return out;
}

/** A single deed that conveys several lots appears once per lot: count how many lots shared it. */
function markBundles(sales) {
  const counts = new Map();
  for (const s of sales) if (s.kind === 'market') counts.set(s.deal_key, (counts.get(s.deal_key) ?? 0) + 1);
  for (const s of sales) if (s.kind === 'market') s.bundle_size = counts.get(s.deal_key);
}

function assessmentsFor(lotId, v) {
  if (!v) return [];
  const byDate = new Map();
  for (const i of [1, 2, 3, 4, 5]) {
    const date = isoDate(v[`Assmnt${i}D`]);
    if (!date || byDate.has(date)) continue;
    const label = clean(v[`ChgDesc${i}`]) || null;
    const reass = label?.match(/^(\d{4}) Reass/);
    byDate.set(date, {
      lot_id: lotId,
      assessed_on: date,
      label,
      // A reassessment recorded late in 2006 takes effect for 2007, so use the cycle named in the label.
      effective_year: reass ? Number(reass[1]) : Number(date.slice(0, 4)),
      land_value: money(v[`LandVal${i}`]),
      building_value: money(v[`DwlgVal${i}`]),
      total_value: money(v[`TotVal${i}`]),
    });
  }
  return [...byDate.values()];
}

/**
 * A lot is "waterfront" when its boundary comes within 15 m (about 50 ft) of the county's shoreline
 * polygon, and that stretch is not a shared edge with a green belt (a strip of common land between
 * the lot and the lake would make it water-access instead). Measured distances fall into two clear
 * groups: under 12 m (lake lots) and over 25 m (interior lots).
 */
function markWaterfront(features, water) {
  const lat0 = 37.118;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const segments = (geoms) => {
    const out = [];
    const walk = (c) => { if (typeof c[0][0] === 'number') { for (let i = 1; i < c.length; i++) out.push([c[i - 1], c[i]]); } else c.forEach(walk); };
    geoms.forEach((g) => g && walk(g.coordinates));
    return out;
  };
  const dist = (p, a, b) => {
    const [px, py, ax, ay, bx, by] = [p[0] * kx, p[1] * ky, a[0] * kx, a[1] * ky, b[0] * kx, b[1] * ky];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(ax + t * dx - px, ay + t * dy - py);
  };
  const nearest = (p, segs) => segs.reduce((best, [a, b]) => Math.min(best, dist(p, a, b)), Infinity);
  const shore = segments(water.map((f) => f.geometry));
  const common = segments(features.filter((f) => f.properties.kind !== 'lot').map((f) => f.geometry));
  for (const f of features) {
    if (f.properties.kind !== 'lot') continue;
    // Sample the boundary every ~3 m so long straight lot lines are not missed.
    const pts = [];
    for (const [a, b] of segments([f.geometry])) {
      const n = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * ky) / 3));
      for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    f.properties.waterfront = pts.some((p) => nearest(p, shore) < 15 && nearest(p, common) > 1.5);
  }
}

function kindOf(lotCode, legal) {
  if (lotCode === 'GB' || /GREEN BELT/.test(legal)) return 'greenbelt';
  if (lotCode === 'RA' || /RECREATION/.test(legal)) return 'recreation';
  if (lotCode === 'WL' || /WELL LOT/.test(legal)) return 'utility';
  if (/PARCEL A/.test(legal)) return 'common';
  return 'lot';
}

function bbox(features) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])];
    } else c.forEach(walk);
  };
  features.forEach((f) => f.geometry && walk(f.geometry.coordinates));
  return b;
}

function centroid(geom) {
  // Area-weighted centroid of the largest outer ring; good enough for label placement.
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let best = null;
  for (const poly of polys) {
    const ring = poly[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (a === 0) continue;
    const c = { area: Math.abs(a / 2), x: cx / (3 * a), y: cy / (3 * a) };
    if (!best || c.area > best.area) best = c;
  }
  return best ? [Number(best.x.toFixed(6)), Number(best.y.toFixed(6))] : null;
}

async function main() {
  console.log('Fetching Village East parcels…');
  const raw = await query(LAYERS.parcels, {
    // Section 4 of tax map 241B (113-120 Wagon Wheel Trail) is recorded by the county as "Crown Point"
    // rather than "Village East", so it is matched by map number instead of by name.
    where: "Legal1 LIKE '%VILLAGE EAST%' OR legal_desc LIKE '%VILLAGE EAST%' OR (MapLink LIKE '241B-4-%' AND Legal1 LIKE 'CROWN POINT%')",
  });
  if (raw.length < 150) throw new Error(`Expected ~186 parcels, got ${raw.length}; aborting.`);

  // Merge multi-part records that share a PIN (green belts are stored as several polygons).
  const byPin = new Map();
  for (const f of raw) {
    const p = f.properties;
    const pin = clean(p.PIN);
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    if (byPin.has(pin)) byPin.get(pin).polys.push(...polys);
    else byPin.set(pin, { p, polys: [...polys] });
  }

  const rpcs = [...byPin.values()].map(({ p }) => clean(p.RPC)).filter(Boolean);
  const inList = rpcs.map((r) => `'${r.replace(/'/g, "''")}'`).join(',');
  console.log('Fetching improvement records…');
  const improvements = await query(LAYERS.improvements, { where: `PIN IN (${inList})` }, { table: true });
  const imprByRpc = new Map();
  for (const f of improvements) {
    const a = f.properties;
    const key = clean(a.PIN);
    // Keep the primary dwelling: the record with the largest finished area.
    const prev = imprByRpc.get(key);
    if (!prev || (num(a.FinSize) ?? 0) > (num(prev.FinSize) ?? 0)) imprByRpc.set(key, a);
  }

  console.log('Fetching deed transfers and assessments…');
  const [landRecords, valuations] = await Promise.all([
    query(LAYERS.landRecords, { where: `PIN IN (${inList})` }, { table: true }),
    query(LAYERS.valuations, { where: `PIN IN (${inList})` }, { table: true }),
  ]);
  const landByRpc = new Map(landRecords.map((f) => [clean(f.properties.PIN), f.properties]));
  const valByRpc = new Map(valuations.map((f) => [clean(f.properties.PIN), f.properties]));

  const publicFeatures = [];
  const facts = [];
  const sales = [];
  const assessments = [];
  const usedIds = new Set();
  for (const [pin, { p, polys }] of byPin) {
    const section = clean(p.DC) || null;
    const lotCode = clean(p.LOT) + clean(p.SUBLOT ?? '');
    const legal = clean(p.Legal1 || p.legal_desc || '');
    const kind = kindOf(lotCode, legal);
    let id = `s${section ?? 'x'}-${lotCode || pin}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    while (usedIds.has(id)) id += 'x';
    usedIds.add(id);
    const address = titleCase(p.LocAddr) || null;
    const acres = num(p.LegalAc);
    const geometry = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
    const label =
      kind === 'lot' ? `Lot ${lotCode}` : { greenbelt: 'Green Belt', recreation: 'Recreation Area', utility: 'Well Lot', common: 'Common Area' }[kind];

    const impr = imprByRpc.get(clean(p.RPC));
    const improved = Boolean(impr && (num(impr.FinSize) || num(impr.YrBuilt)));
    publicFeatures.push({
      type: 'Feature',
      id,
      geometry,
      properties: { id, kind, label, lot: lotCode || null, section, address, acres, improved, waterfront: false, center: centroid(geometry) },
    });

    facts.push({
      lot_id: id,
      owner_names: [p.Owner1, p.Owner2].map(ownerCase).filter(Boolean),
      legal_description: legal,
      year_built: impr ? num(impr.YrBuilt) : null,
      finished_sqft: impr ? num(impr.FinSize) : null,
      stories: impr ? clean(String(impr.Stories ?? '')) || null : null,
      bedrooms: impr ? num(impr.NumBdRms) : null,
      full_baths: impr ? num(impr.Num3Baths) : null,
      half_baths: impr ? num(impr.Num2Baths) : null,
      building_style: impr ? titleCase(String(impr.BldgType || impr.UseDesc || '').replace(/^\s*\d+\s+/, '')) || null : null,
      exterior: impr ? titleCase(impr.ExtDesc1 || '') || null : null,
      owner_since_year: /\d{4}$/.test(clean(p.Sale1D) ?? '') ? Number(clean(p.Sale1D).slice(-4)) : null,
      // The county keeps only the 3 most recent transfers. When all 3 slots are used, nothing is known
      // about transfers before the oldest one, so analytics treat earlier years as incomplete.
      sales_history_from: transferHistoryFrom(landByRpc.get(clean(p.RPC))),
    });
    sales.push(...transfersFor(id, landByRpc.get(clean(p.RPC))));
    assessments.push(...assessmentsFor(id, valByRpc.get(clean(p.RPC))));
  }
  publicFeatures.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

  const [w, s, e, n] = bbox(publicFeatures);
  const pad = 0.004;
  const envelope = { geometry: `${w - pad},${s - pad},${e + pad},${n + pad}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' };
  console.log('Fetching roads, buildings, shoreline…');
  const [roads, buildings, water] = await Promise.all([
    query(LAYERS.roads, { ...envelope, outFields: 'fullname,roadclass' }),
    query(LAYERS.buildings, { ...envelope, outFields: 'OBJECTID' }),
    query(LAYERS.water, { ...envelope, outFields: 'NAME,TYPE', maxAllowableOffset: '0.00002' }),
  ]);
  const context = {
    type: 'FeatureCollection',
    features: [
      ...roads.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { layer: 'road', name: titleCase(f.properties.fullname) } })),
      ...buildings.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { layer: 'building' } })),
      ...water.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { layer: 'water', name: titleCase(f.properties.NAME) } })),
    ],
  };

  markWaterfront(publicFeatures, water);
  console.log(`  ${publicFeatures.filter((f) => f.properties.waterfront).length} waterfront lots`);

  console.log('Fetching community facts…');
  const center = [(w + e) / 2, (s + n) / 2];
  const at = { geometry: `${center[0]},${center[1]}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'false' };
  const first = async (layer, extra = {}) => (await query(layer, { ...at, ...extra }).catch(() => []))[0]?.properties ?? null;
  const nearest = async (layer) => {
    const pts = await query(layer, {}).catch(() => []);
    const d = (f) => Math.hypot((f.geometry.coordinates[0] - center[0]) * Math.cos((center[1] * Math.PI) / 180), f.geometry.coordinates[1] - center[1]);
    const best = pts.filter((f) => f.geometry).sort((a, b) => d(a) - d(b))[0];
    return best ? { ...best.properties, miles: Number((d(best) * 69).toFixed(1)), coordinates: best.geometry.coordinates } : null;
  };
  const [fire, rescue, elem, mid, high, precinct, district, zoning, fireStation, rescueSquad, collection] = await Promise.all([
    first(LAYERS.fireDistrict), first(LAYERS.rescueDistrict), first(LAYERS.elementary), first(LAYERS.middle), first(LAYERS.high),
    first(LAYERS.precinct), first(LAYERS.votingDistrict), first(LAYERS.zoning),
    nearest(LAYERS.fireStations), nearest(LAYERS.rescueSquads), nearest(LAYERS.collection),
  ]);
  const pick = (o, keys) => (o ? Object.fromEntries(keys.filter((k) => o[k] != null && clean(String(o[k])) !== '').map((k) => [k, clean(o[k])])) : null);
  const communityFacts = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'Bedford County, VA GIS Open Data (geohub-bedfordvagis.opendata.arcgis.com)',
    center,
    bounds: [w, s, e, n],
    counts: {
      lots: publicFeatures.filter((f) => f.properties.kind === 'lot').length,
      homes: publicFeatures.filter((f) => f.properties.kind === 'lot' && f.properties.improved).length,
      waterfront: publicFeatures.filter((f) => f.properties.waterfront).length,
      acres: Number(publicFeatures.reduce((t, f) => t + (f.properties.acres ?? 0), 0).toFixed(1)),
    },
    fireDistrict: pick(fire, ['NAME', 'CompanyNumber']),
    rescueDistrict: pick(rescue, ['NAME', 'SquadNumber']),
    nearestFireStation: pick(fireStation, ['FIRE_COMPANY', 'COMPANY', 'ADDRESS', 'CITY', 'miles']),
    nearestRescueSquad: pick(rescueSquad, ['RESCUE_SQUAD', 'SQUAD', 'ADDRESS', 'CITY', 'miles']),
    elementary: pick(elem, ['SCHOOL', 'GRADES', 'FULL_ADDRESS', 'CITY', 'URL']),
    middle: pick(mid, ['MIDDLE_SCHOOL', 'GRADES', 'FULL_ADDRESS', 'CITY', 'URL']),
    high: pick(high, ['HIGH_SCHOOL', 'GRADES', 'FULL_ADDRESS', 'CITY', 'URL']),
    precinct: pick(precinct, ['Precinct', 'District', 'PrecinctNumber', 'PrecinctAddress']),
    votingDistrict: pick(district, ['District', 'LABEL']),
    zoning: pick(zoning, ['ZONING', 'ZONING_DISTRICT']),
    collectionCenter: pick(collection, ['SITE_NAME', 'ADDRESS', 'HOURS', 'RECYCLING', 'miles']),
  };

  const write = async (rel, data) => {
    const file = resolve(ROOT, rel);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data));
    console.log(`  wrote ${rel}`);
  };
  await write('public/data/map/parcels.geojson', { type: 'FeatureCollection', features: publicFeatures });
  await write('public/data/map/context.geojson', context);
  await write('src/data/community-facts.json', communityFacts);
  await write('supabase/seed/generated/lot_facts.json', facts);
  markBundles(sales);
  await write('supabase/seed/generated/lot_sales.json', sales);
  await write('supabase/seed/generated/lot_assessments.json', assessments);
  console.log(`  ${sales.length} transfers (${sales.filter((x) => x.kind === 'market').length} market sales), ${assessments.length} assessment records`);
  console.log(`Done: ${publicFeatures.length} parcels (${communityFacts.counts.lots} lots, ${communityFacts.counts.homes} with homes).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
