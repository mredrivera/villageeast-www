#!/usr/bin/env node
/**
 * Creates a member account from the command line (the same thing Admin > Members > "Add a member"
 * does in the site). The person can then sign in with a one-time email code.
 *
 *   node scripts/add-member.mjs --email jane@example.com --name "Jane Doe" --lot s1-15 [--role resident|board|admin]
 *
 * Reads SUPABASE_URL and SUPABASE_SECRET_KEY from the environment, .env.seed or .dev.vars.
 * Find a lot id by searching the address on the community map (it is the ?lot= value in the URL).
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['.env.seed', '.dev.vars']) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((a) => { const i = a.indexOf(' '); return i < 0 ? [a, ''] : [a.slice(0, i), a.slice(i + 1).trim()]; }));
const email = (args.email ?? '').toLowerCase();
const name = args.name ?? '';
const lot = args.lot || null;
const role = args.role || 'resident';
const fail = (msg) => { console.error(msg); process.exit(1); };

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) fail('Set SUPABASE_URL and SUPABASE_SECRET_KEY (for example in .env.seed).');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || name.length < 2) fail('Usage: node scripts/add-member.mjs --email a@b.com --name "Full Name" --lot s1-15 [--role resident]');
if (!['resident', 'board', 'admin'].includes(role)) fail('--role must be resident, board or admin.');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let where = 'no lot (cannot vote)';
if (lot) {
  const { data, error } = await db.from('lots').select('label,section,address').eq('id', lot).maybeSingle();
  if (error) fail(`Could not read lots: ${error.message}`);
  if (!data) fail(`Unknown lot id "${lot}". Run the seed first, or check the id on the community map.`);
  where = `${data.address ?? data.label} (Section ${data.section}, ${data.label})`;
}

const { data: existing } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
if (existing) {
  const { error } = await db.from('profiles').update({ full_name: name, lot_id: lot, role, status: 'approved' }).eq('id', existing.id);
  if (error) fail(`Could not update the existing account: ${error.message}`);
  console.log(`Updated existing account: ${name}, ${where}, role ${role}.`);
} else {
  const inv = await db.from('member_invites').upsert({ email, full_name: name, lot_id: lot, role });
  if (inv.error) fail(`Could not prepare the account: ${inv.error.message}`);
  const { error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) { await db.from('member_invites').delete().eq('email', email); fail(`Could not create the account: ${error.message}`); }
  console.log(`Created account: ${name}, ${where}, role ${role}.`);
}
console.log('They can now sign in at /auth/sign-in with a one-time email code. No email was sent by this script.');
