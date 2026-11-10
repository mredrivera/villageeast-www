#!/usr/bin/env node
/**
 * Loads the starting content into a Supabase project. Safe to re-run (everything is an upsert).
 *
 *   1. lots                 from public/data/map/parcels.geojson
 *   2. lot_facts            from supabase/seed/generated/lot_facts.json (run `npm run gis:sync` first)
 *   3. documents + files    from content/documents (uploaded to the private `documents` bucket)
 *   4. events, announcements, the Social Club survey and a demonstration ballot
 *   5. the first administrator account
 *
 * Required environment (or put them in .dev.vars / .env.seed):
 *   SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_EMAIL
 * Optional: ADMIN_NAME, ADMIN_LOT (lot id such as "s2-26"), SKIP_FILES=1
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));

// Minimal KEY=value loader so the script works without extra dependencies.
for (const file of ['.env.seed', '.dev.vars']) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_EMAIL, ADMIN_NAME = '', ADMIN_LOT = '', SKIP_FILES } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY (see docs/SETUP.md).');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const must = ({ error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); };
const et = (date, time) => new Date(`${date}T${time}:00-0${isDst(date) ? 4 : 5}:00`).toISOString();
function isDst(date) { // US Eastern daylight time: second Sunday of March to first Sunday of November
  const [y, m, d] = date.split('-').map(Number);
  const nthSunday = (month, n) => { const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + 7 * (n - 1); };
  if (m < 3 || m > 11) return false;
  if (m > 3 && m < 11) return true;
  return m === 3 ? d >= nthSunday(3, 2) : d < nthSunday(11, 1);
}

async function seedLots() {
  const { features } = read('public/data/map/parcels.geojson');
  const rows = features.map(({ properties: p }) => ({ id: p.id, kind: p.kind, label: p.label, lot: p.lot, section: p.section, address: p.address, acres: p.acres, improved: p.improved }));
  must(await db.from('lots').upsert(rows), 'lots');
  console.log(`lots: ${rows.length}`);
  const factsPath = 'supabase/seed/generated/lot_facts.json';
  if (!existsSync(resolve(ROOT, factsPath))) return console.warn('lot_facts: skipped (run `npm run gis:sync` to generate them)');
  const ids = new Set(rows.map((r) => r.id));
  const facts = read(factsPath).filter((f) => ids.has(f.lot_id));
  must(await db.from('lot_facts').upsert(facts), 'lot_facts');
  console.log(`lot_facts: ${facts.length}`);
}

async function seedDocuments() {
  const catalog = read('content/documents/catalog.json');
  let uploaded = 0;
  for (const doc of catalog) {
    if (!SKIP_FILES) {
      const body = readFileSync(resolve(ROOT, 'content/documents', doc.path));
      must(await db.storage.from('documents').upload(doc.path, body, { contentType: doc.mime_type, upsert: true }), `upload ${doc.path}`);
      uploaded++;
    }
    const { path, ...row } = doc;
    must(await db.from('documents').upsert({ ...row, storage_path: path }, { onConflict: 'storage_path' }), `document ${path}`);
  }
  console.log(`documents: ${catalog.length} (${uploaded} files uploaded)`);
}

async function seedOnce(table, keyColumn, rows) {
  const { data, error } = await db.from(table).select(keyColumn);
  if (error) throw new Error(`${table}: ${error.message}`);
  const have = new Set(data.map((r) => r[keyColumn]));
  const fresh = rows.filter((r) => !have.has(r[keyColumn]));
  if (fresh.length) must(await db.from(table).insert(fresh), table);
  console.log(`${table}: ${fresh.length} added, ${rows.length - fresh.length} already present`);
}

async function seedContent() {
  const board = (date, loc, time = '19:00') => ({ title: 'VEPOA Board Meeting', kind: 'board_meeting', starts_at: et(date, time), location: loc, description: 'All members are encouraged to attend.' });
  const events = [
    board('2026-03-05', 'Moneta Library'),
    { title: 'Spring Clean-Up', kind: 'cleanup', starts_at: et('2026-04-11', '09:00'), location: 'Village East entrance', description: 'Bring gloves; we will meet at the entrance.' },
    board('2026-04-28', 'Moneta Library'),
    { title: 'VEPOA Annual Membership Meeting', kind: 'annual_meeting', starts_at: et('2026-06-06', '13:00'), location: 'Village East Pool House', description: 'Election of four board members and a vote on the proposed bylaw amendment.' },
    { title: 'Community Potluck', kind: 'social', starts_at: et('2026-08-30', '17:00'), location: 'Pool Clubhouse, 402 Indian Ridge Drive', description: 'Bring a dish to share and meet your neighbors.' },
    board('2026-09-24', 'Trinity Ecumenical'),
    { title: 'Fall Clean-Up', kind: 'cleanup', starts_at: et('2026-10-17', '09:00'), location: 'Village East entrance', description: 'Meet at the Village East entrance.' },
    { title: 'Trick or Treating', kind: 'social', starts_at: et('2026-10-31', '17:30'), location: 'Throughout Village East', description: 'Sign up through the Social Club so families know which homes are taking part.' },
    board('2026-12-03', 'Moneta Library'),
    { title: 'Christmas Party', kind: 'social', starts_at: et('2026-12-10', '18:00'), location: "Tiff's Restaurant", description: 'Save the date! Details to follow in the newsletter.' },
  ].map((e) => ({ ...e, visibility: 'public' }));
  // Events have no natural key; use title+start to stay idempotent.
  const { data: haveEvents } = await db.from('events').select('title,starts_at');
  const seen = new Set((haveEvents ?? []).map((e) => `${e.title}|${new Date(e.starts_at).toISOString()}`));
  const freshEvents = events.filter((e) => !seen.has(`${e.title}|${e.starts_at}`));
  if (freshEvents.length) must(await db.from('events').insert(freshEvents), 'events');
  console.log(`events: ${freshEvents.length} added`);

  await seedOnce('announcements', 'title', [
    { title: 'Christmas Party: save the date', body: "Join your neighbors on Thursday, December 10, 2026 at Tiff's Restaurant. Watch the newsletter for details.", visibility: 'public', pinned: true, published_at: et('2026-11-01', '09:00') },
    { title: 'Four board positions open', body: 'Four seats on the Board of Directors opened in June 2026. Serving on the board or a committee is a great way to shape the community. Contact the board to learn more.', visibility: 'public', pinned: false, published_at: et('2026-03-01', '09:00') },
    { title: 'New: tell us what you want from the Social Club', body: 'The new Social Club team wants to connect neighbors through fun activities. Owners can complete the Social Club survey online in the member area. It takes about three minutes.', visibility: 'public', pinned: false, published_at: et('2026-10-20', '09:00') },
    { title: 'Community resource: Smith Mountain Lake Association', body: 'The SMLA monitors water quality, promotes safe boating and advocates for the lake. Visit smlassociation.org to learn more.', visibility: 'public', pinned: false, published_at: et('2026-02-01', '09:00') },
  ]);

  const opts = (list) => list.map((label) => ({ value: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), label }));
  await seedOnce('surveys', 'slug', [{
    slug: 'social-club-2026',
    title: 'Social Club Survey #1 (2026)',
    intro: 'This survey is sponsored by our new Social Club team. Our mission is to connect neighbors by enhancing communication and facilitating fun social activities that create a strong sense of community. Fill out what you are comfortable with.',
    status: 'open',
    anonymous: false,
    fields: [
      { type: 'section', label: 'Your household' },
      { type: 'number', name: 'household_size', label: 'How many people are in your household?', min: 1, max: 20, required: true },
      { type: 'text', name: 'children_ages', label: 'Ages of any children (1 to 17)', placeholder: 'e.g. 6, 9, 14', maxLength: 80 },
      { type: 'number', name: 'adults_18_40', label: 'Number of people aged 18 to 40', min: 0, max: 20 },
      { type: 'number', name: 'adults_40_60', label: 'Number of people aged 40 to 60', min: 0, max: 20 },
      { type: 'number', name: 'adults_60_plus', label: 'Number of people aged 60+', min: 0, max: 20 },
      { type: 'radio', name: 'residency', label: 'Are you here year-round or seasonally?', required: true, options: [{ value: 'year_round', label: 'Year-round' }, { value: 'summer', label: 'Summer only' }, { value: 'weekends', label: 'Weekends and holidays' }] },
      { type: 'section', label: 'What sounds fun?', help: 'Tick anything someone in your household is interested in, even if you do not know how to play.' },
      { type: 'checkboxes', name: 'cards_games', label: 'Cards and board games', options: opts(['Bridge', 'Bunco', 'Canasta', 'Mah Jong', 'Poker']) },
      { type: 'checkboxes', name: 'sports', label: 'Sports', options: opts(['Badminton', 'Baseball', 'Softball', 'Biking', 'Hiking (trips)', 'Tennis', 'Walking', 'Croquet', 'Volleyball', 'Pickleball', 'Bocce ball']) },
      { type: 'checkboxes', name: 'clubs', label: 'Other clubs', options: opts(['Geocaching', 'Cooking', 'Book', 'Garden', 'Bible study']) },
      { type: 'checkboxes', name: 'misc', label: 'Community events', options: opts(['Community yard sale', 'Potluck dinners']) },
      { type: 'scale', name: 'event_interest', label: 'How likely are you to come to a community social event?', min: 1, max: 5, minLabel: 'Unlikely', maxLabel: 'Count me in' },
      { type: 'section', label: 'Get involved' },
      { type: 'radio', name: 'involvement', label: 'Would you like to help?', options: [{ value: 'team', label: 'I would like to join the Social Club team' }, { value: 'helper', label: 'I would like to be a helper only' }, { value: 'no', label: 'Not right now' }] },
      { type: 'text', name: 'can_teach', label: 'I can teach or lead the basics of…', maxLength: 200, help: 'You do not need to be a pro.' },
      { type: 'textarea', name: 'suggestions', label: 'Suggestions, comments or questions', maxLength: 1500, rows: 4 },
    ],
  }]);

  const { data: existing } = await db.from('ballots').select('id').eq('title', 'Demonstration ballot: bylaw amendment and community priorities');
  if (!existing?.length) {
    const { data: ballot, error } = await db.from('ballots').insert({
      title: 'Demonstration ballot: bylaw amendment and community priorities',
      description: 'This is a demonstration of secure online voting and is NOT an official VEPOA vote. The first question mirrors the June 2026 paper ballot on the proposed enforcement bylaw. Each lot gets one vote; who voted is recorded, but individual choices are never linked to a voter.',
      opens_at: new Date(Date.now() - 86400000).toISOString(),
      closes_at: new Date(Date.now() + 45 * 86400000).toISOString(),
      status: 'published',
    }).select('id').single();
    if (error) throw new Error(`ballots: ${error.message}`);
    must(await db.from('ballot_questions').insert([
      { ballot_id: ballot.id, position: 1, prompt: 'Do you approve the adoption of the proposed bylaw amendment establishing a formal enforcement process?', detail: 'The amendment adds a notice-and-cure process for violations of the Architectural Guidelines and protective covenants. Two written notices are required before the Board may vote on a fine, fines follow Virginia law limits ($50 per offense or $10 per day up to 90 days), and a lien remains a last resort.', max_choices: 1, options: [{ id: 'yes', label: 'Yes, I approve the amendment' }, { id: 'no', label: 'No, I do not approve the amendment' }] },
      { ballot_id: ballot.id, position: 2, prompt: 'Which capital projects should the board prioritise next? (choose up to 2)', detail: 'Advisory only. Options are drawn from the published reserve analysis.', max_choices: 2, options: [{ id: 'culverts', label: 'Little Creek culvert work' }, { id: 'paving', label: 'Continue road repaving (Indian Ridge, Ridgeway)' }, { id: 'storage', label: 'Additional boat storage lot' }, { id: 'dock', label: 'Dock and boat ramp improvements' }, { id: 'pool', label: 'Pool cover and filters' }] },
    ]), 'ballot_questions');
    console.log('ballots: demonstration ballot added');
  } else console.log('ballots: demonstration ballot already present');
}

async function seedAdmin() {
  if (!ADMIN_EMAIL) return console.warn('admin: skipped (set ADMIN_EMAIL to create the first administrator)');
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const { data: profile } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  if (profile) {
    must(await db.from('profiles').update({ role: 'admin', status: 'approved', ...(ADMIN_NAME && { full_name: ADMIN_NAME }), ...(ADMIN_LOT && { lot_id: ADMIN_LOT }) }).eq('id', profile.id), 'admin profile');
    return console.log('admin: existing account promoted to administrator');
  }
  must(await db.from('member_invites').upsert({ email, full_name: ADMIN_NAME, lot_id: ADMIN_LOT || null, role: 'admin' }), 'admin invite');
  const { error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(`admin user: ${error.message}`);
  console.log('admin: administrator account created (sign in with a one-time email code)');
}

try {
  await seedLots();
  await seedDocuments();
  await seedContent();
  await seedAdmin();
  console.log('Seed complete.');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
