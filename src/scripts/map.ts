import * as maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Serve MapLibre's worker from our own origin (hashed asset) so it loads under the strict CSP.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);

type LotProps = { id: string; kind: string; label: string; lot: string | null; section: string | null; address: string | null; acres: number | null; improved: boolean; center: string | [number, number] };
type LotFeature = Feature<Geometry, LotProps>;

const el = document.getElementById('map');
if (el) void init(el);

async function init(container: HTMLElement) {
  const member = container.dataset.member === '1';
  const [w, s, e, n] = JSON.parse(container.dataset.bounds ?? '[]') as number[];
  const parcels = (await (await fetch('/data/map/parcels.geojson')).json()) as FeatureCollection<Geometry, LotProps>;
  const byId = new Map(parcels.features.map((f) => [f.properties.id, f as LotFeature]));
  const font = ['Noto Sans Regular'];
  const bold = ['Noto Sans Bold'];

  // A fully self-hosted style: no third-party tiles, so the map works under a strict CSP and
  // never tells an outside service which lot somebody is looking at.
  const style: StyleSpecification = {
    version: 8,
    glyphs: `${location.origin}/fonts/map/{fontstack}/{range}.pbf`,
    sources: {
      parcels: { type: 'geojson', data: parcels, promoteId: 'id' },
      context: { type: 'geojson', data: '/data/map/context.geojson' },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': '#eef2e8' } },
      { id: 'water', type: 'fill', source: 'context', filter: ['==', ['get', 'layer'], 'water'], paint: { 'fill-color': '#a9d3de' } },
      { id: 'water-edge', type: 'line', source: 'context', filter: ['==', ['get', 'layer'], 'water'], paint: { 'line-color': '#7fb4c2', 'line-width': 1 } },
      { id: 'parcel-fill', type: 'fill', source: 'parcels', paint: {
        'fill-color': ['match', ['get', 'kind'], 'greenbelt', '#a9cfa4', 'common', '#a9cfa4', 'utility', '#c9d3cf', 'recreation', '#f0b77a', ['case', ['get', 'improved'], '#f3e3c3', '#dfeadd']],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.82],
      } },
      { id: 'road-case', type: 'line', source: 'context', filter: ['==', ['get', 'layer'], 'road'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#c9c2b3', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 2.5, 18, 16] } },
      { id: 'road', type: 'line', source: 'context', filter: ['==', ['get', 'layer'], 'road'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 1.5, 18, 12] } },
      { id: 'building', type: 'fill', source: 'context', minzoom: 15, filter: ['==', ['get', 'layer'], 'building'], paint: { 'fill-color': '#b9a98f', 'fill-opacity': 0.75 } },
      { id: 'parcel-line', type: 'line', source: 'parcels', paint: { 'line-color': '#7c8f84', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.4, 17, 1.4] } },
      { id: 'parcel-selected', type: 'line', source: 'parcels', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#b9692a', 'line-width': 3.5 } },
      { id: 'road-label', type: 'symbol', source: 'context', minzoom: 14, filter: ['==', ['get', 'layer'], 'road'], layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': font, 'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 18, 14], 'symbol-spacing': 320 }, paint: { 'text-color': '#4e5b55', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
      { id: 'water-label', type: 'symbol', source: 'context', filter: ['==', ['get', 'layer'], 'water'], layout: { 'text-field': 'Smith Mountain Lake', 'text-font': font, 'text-size': 14, 'text-letter-spacing': 0.15 }, paint: { 'text-color': '#3f7f90', 'text-halo-color': '#cfe7ed', 'text-halo-width': 1.5 } },
      { id: 'lot-label', type: 'symbol', source: 'parcels', minzoom: 15.6, layout: {
        'text-field': ['step', ['zoom'],
          ['case', ['==', ['get', 'kind'], 'lot'], ['get', 'lot'], ['get', 'label']],
          17,
          ['case',
            ['all', ['==', ['get', 'kind'], 'lot'], ['has', 'address']],
            ['format', ['slice', ['get', 'address'], 0, ['index-of', ' ', ['get', 'address']]], { 'font-scale': 1 }, '\n', {}, ['concat', 'Lot ', ['get', 'lot']], { 'font-scale': 0.78 }],
            ['==', ['get', 'kind'], 'lot'], ['concat', 'Lot ', ['get', 'lot']],
            ['get', 'label']]],
        'text-font': bold, 'text-size': ['interpolate', ['linear'], ['zoom'], 15.6, 9.5, 18, 13], 'text-max-width': 6, 'text-padding': 1,
      }, paint: { 'text-color': '#33443c', 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1.4 } },
    ],
  };

  const map = new maplibregl.Map({
    container, style, bounds: [[w!, s!], [e!, n!]], fitBoundsOptions: { padding: 28 },
    maxBounds: [[w! - 0.03, s! - 0.03], [e! + 0.03, n! + 0.03]], minZoom: 12.5, maxZoom: 19, attributionControl: false, cooperativeGestures: true,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
  map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Parcel data: Bedford County, VA GIS' }), 'bottom-right');

  const title = document.getElementById('lot-title')!;
  const sub = document.getElementById('lot-sub')!;
  const factsEl = document.getElementById('lot-facts') as HTMLElement;
  const privateEl = document.getElementById('lot-private') as HTMLElement;
  let requestSeq = 0;

  const dlRow = (parent: HTMLElement, k: string, v: string) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v; // textContent: never interpret data as HTML
    parent.append(dt, dd);
  };

  async function select(id: string, fly: boolean) {
    const f = byId.get(id);
    if (!f) return;
    const p = f.properties;
    map.setFilter('parcel-selected', ['==', ['get', 'id'], id]);
    const center = typeof p.center === 'string' ? (JSON.parse(p.center) as [number, number]) : p.center;
    if (fly && center) map.flyTo({ center, zoom: Math.max(map.getZoom(), 17), essential: true });
    title.textContent = p.address ?? p.label;
    sub.textContent = p.kind === 'lot' ? `${p.label}, Section ${p.section}` : `${p.label} (association property)`;
    factsEl.replaceChildren();
    factsEl.hidden = false;
    if (p.acres) dlRow(factsEl, 'Acreage', `${p.acres} acres`);
    if (p.kind === 'lot') dlRow(factsEl, 'Status', p.improved ? 'Home on lot' : 'Undeveloped lot');
    history.replaceState(null, '', `?lot=${encodeURIComponent(id)}`);
    privateEl.hidden = true;
    privateEl.replaceChildren();
    if (!member || p.kind !== 'lot') return;
    const seq = ++requestSeq;
    try {
      const res = await fetch(`/members/api/lot/${encodeURIComponent(id)}.json`, { headers: { accept: 'application/json' } });
      if (!res.ok || seq !== requestSeq) return;
      const d = (await res.json()) as Record<string, unknown>;
      const dl = document.createElement('dl'); dl.className = 'dl mt-2';
      const owners = Array.isArray(d.owner_names) ? (d.owner_names as string[]).join('; ') : '';
      if (owners) dlRow(dl, 'Owner of record', owners);
      if (d.owner_since_year) dlRow(dl, 'Owner since', String(d.owner_since_year));
      if (d.year_built) dlRow(dl, 'Year built', String(d.year_built));
      if (d.finished_sqft) dlRow(dl, 'Finished area', `${Number(d.finished_sqft).toLocaleString('en-US')} sq ft`);
      if (d.bedrooms) dlRow(dl, 'Bedrooms', String(d.bedrooms));
      if (d.full_baths || d.half_baths) dlRow(dl, 'Bathrooms', [d.full_baths ? `${d.full_baths} full` : '', d.half_baths ? `${d.half_baths} half` : ''].filter(Boolean).join(', '));
      if (d.building_style) dlRow(dl, 'Style', String(d.building_style));
      if (d.exterior) dlRow(dl, 'Exterior', String(d.exterior));
      const note = document.createElement('p'); note.className = 'small muted mt-2 mb-0'; note.textContent = 'Owners only. From county records; please keep it within the community.';
      privateEl.append(dl, note);
      privateEl.hidden = dl.children.length === 0;
    } catch { /* offline or signed out: the public details remain */ }
  }

  let hovered: string | null = null;
  map.on('mousemove', 'parcel-fill', (ev) => {
    const id = ev.features?.[0]?.properties?.id as string | undefined;
    if (!id || id === hovered) return;
    if (hovered) map.setFeatureState({ source: 'parcels', id: hovered }, { hover: false });
    hovered = id;
    map.setFeatureState({ source: 'parcels', id }, { hover: true });
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'parcel-fill', () => {
    if (hovered) map.setFeatureState({ source: 'parcels', id: hovered }, { hover: false });
    hovered = null;
    map.getCanvas().style.cursor = '';
  });
  map.on('click', 'parcel-fill', (ev) => { const id = ev.features?.[0]?.properties?.id as string | undefined; if (id) void select(id, false); });

  // Search
  const input = document.getElementById('map-q') as HTMLInputElement;
  const results = document.getElementById('map-results') as HTMLUListElement;
  const index = parcels.features.map((f) => ({ id: f.properties.id, text: `${f.properties.address ?? ''} ${f.properties.label} Section ${f.properties.section ?? ''}`.toLowerCase(), label: f.properties.address ? `${f.properties.address} (${f.properties.label})` : `${f.properties.label}, Section ${f.properties.section ?? ''}` }));
  const close = () => { results.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    results.replaceChildren();
    if (q.length < 2) return close();
    const terms = q.split(/\s+/);
    for (const hit of index.filter((i) => terms.every((t) => i.text.includes(t))).slice(0, 8)) {
      const li = document.createElement('li'); li.setAttribute('role', 'option');
      const b = document.createElement('button'); b.type = 'button'; b.textContent = hit.label;
      b.addEventListener('click', () => { input.value = hit.label; close(); void select(hit.id, true); });
      li.append(b); results.append(li);
    }
    results.hidden = results.children.length === 0;
    input.setAttribute('aria-expanded', String(!results.hidden));
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); (results.querySelector('button') as HTMLButtonElement | null)?.click(); }
    if (ev.key === 'Escape') close();
    if (ev.key === 'ArrowDown') { ev.preventDefault(); (results.querySelector('button') as HTMLButtonElement | null)?.focus(); }
  });
  document.addEventListener('click', (ev) => { if (!(ev.target as HTMLElement).closest('.map-search')) close(); });

  map.on('load', () => {
    const initial = new URLSearchParams(location.search).get('lot');
    if (initial && byId.has(initial)) void select(initial, true);
    (map.getSource('parcels') as GeoJSONSource | undefined) && container.setAttribute('data-ready', '1');
  });
}
