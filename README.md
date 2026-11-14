# villageeast-www

A proposed new website for the Village East Property Owners Association (Smith Mountain Lake, Moneta,
Virginia), built as a demonstration at `villageeast.toston.io`. It is not the official VEPOA site.

**To deploy it, follow [docs/SETUP.md](docs/SETUP.md).**

## What it does

| Area | Who | Highlights |
|---|---|---|
| Public site | Everyone | Home, amenities, meeting calendar, governing documents, realtor packet, contact form |
| Community map | Everyone | Every lot line, lot number and street address from Bedford County GIS, with search. Self-hosted: no third-party map tiles |
| Map, owner layer | Owners | Owner of record and basic property facts (year built, size, bedrooms) |
| Financials | Owners | 2019-2025 income and spending: money-flow diagram, trends, budget vs. actual, reserve fund, line-by-line table |
| Records | Owners | Minutes and agendas as a meeting timeline, newsletters back to 2013, board rosters, notices |
| Surveys | Owners | The paper Social Club survey as an online form; results tallied live, CSV export |
| Voting | Owners | Secret ballots, one vote per lot, results published when voting closes |
| Dues | Owners / board | Each owner sees whether their own lot's annual dues are recorded as paid, with a reminder when they are not; board members see every lot, record payments and export the list |
| Requests | Owners | Architectural review, boat/trailer storage, deer-culling permission, report a concern: with attachments, status tracking and email notices |
| Directory | Owners | Opt-in only; each owner chooses what to share |
| Admin | Board / admin | Approve accounts, review requests, build surveys and ballots, post news and events, manage documents, audit log |

## How it is built

- **[Astro](https://astro.build) on Cloudflare Workers.** Every page is rendered on the server; the
  browser never talks to the database directly.
- **Supabase** for sign-in, Postgres and private file storage. **Resend** for email.
  **Cloudflare Turnstile** for bot protection.
- No client framework: plain TypeScript for the map ([MapLibre](https://maplibre.org)) and charts
  ([ECharts](https://echarts.apache.org)).

```
src/pages/            Routes. /members/* needs an approved owner; /admin/* needs board or admin.
src/middleware.ts     Session lookup, access guard, security headers
src/lib/              Supabase clients, mail, security helpers, the form engine (forms/)
src/data/finance.ts   Financial history transcribed from the treasurer's reports
src/scripts/          Browser code for the map and charts
supabase/migrations/  Tables, row-level security, voting functions
supabase/tests/       Database security regression checks
content/documents/    The 96 documents imported from the old site + catalog.json
scripts/              gis-sync (county data), seed (load a project), import-legacy, fetch-legacy-photos
```

## Security model

- **Sign-in is passwordless.** Owners enter their email and receive a 6-digit code that expires in
  10 minutes. There are no passwords to leak or reuse. Self-registration is off: an administrator
  creates each account after checking it against the lot roster, and responses never reveal whether
  an email has an account.
- **Sessions** live in `HttpOnly`, `Secure`, `SameSite=Lax` cookies. Page scripts cannot read them.
- **Defense in depth.** The server checks access in middleware, and Postgres row-level security
  checks it again for every query, using the visitor's own identity. A bug in a page cannot expose
  another owner's data. The privileged key is used only for admin actions and to sign storage links,
  after authorization.
- **Private files.** Documents and attachments sit in private storage buckets with no public policies.
  Downloads go through the server, which issues a link valid for 60 seconds.
- **Secret ballots.** "Which lot voted" and "what was chosen" are stored in separate tables with no
  link between them. Vote rows cannot be read by anyone; only tally functions can count them, and
  members see results only after voting closes.
- **Web hardening.** Strict Content-Security-Policy with no inline or third-party scripts (Turnstile
  excepted), HSTS, no framing, same-origin checks on every form post, rate limiting, server-side
  validation of every field, upload type checks by file signature, and an audit log of admin actions.
- **Privacy by design.** Owner mailing addresses, sale prices and assessed values are never collected.
  Owner names are fetched from the county into a gitignored file and stored only in the members-only
  table. No analytics or advertising trackers.
- **Demo safety switch.** The site only sends email to addresses in `MAIL_ALLOWLIST`.

## Where the old content went

All files from villageeast.org were downloaded, de-duplicated (2 exact duplicates), renamed and
catalogued in `content/documents/catalog.json` with a category, date and visibility. Each entry keeps
its original URL. Financial reports, minutes, newsletters, ballots and rosters are owners-only;
governing documents, rules, paper forms and realtor documents stay public.

## Routine updates

| Task | How |
|---|---|
| Add a document, event or announcement | Admin area, no code needed |
| Add a financial year | Append to `YEARS` in `src/data/finance.ts`; `npm test` checks the totals |
| Refresh map and owner data | `npm run gis:sync` then `npm run seed`, and redeploy |
| Add a request form | Add a definition to `src/lib/forms/definitions.ts` |
| Change who receives email | `MAIL_ALLOWLIST` / `ADMIN_NOTIFY_EMAIL` in `wrangler.jsonc` |

## Known limits of the demo

- The map has no aerial photo layer (the county publishes none openly).
- County records merge some lots, so the map shows 169 lots where the association counts 181.
- Online ballots are a demonstration. Before using them for a binding vote, the board should confirm
  that the by-laws permit electronic voting.
