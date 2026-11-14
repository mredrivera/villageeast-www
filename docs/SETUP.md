# Setup guide

Everything here fits in the free tiers of Supabase, Cloudflare and Resend. Allow about 45 minutes.
Do the steps in order; each one produces a value that a later step needs. Keep a scratch note open
for the values marked **save this**.

| Service | Used for | Free tier we rely on |
|---|---|---|
| Cloudflare Workers | Hosting the site at `villageeast.toston.io` | 100,000 requests/day |
| Cloudflare Turnstile | Bot check on sign-in and public forms | Unlimited |
| Supabase | Sign-in, database, private file storage | 500 MB database, 1 GB files (we use ~85 MB) |
| Resend | Sending sign-in codes and notices | 3,000 emails/month, 1 domain |

## 0. Get the code running on your computer

You need [Node.js 22 or newer](https://nodejs.org) and git.

```bash
git clone https://github.com/mredrivera/villageeast-www.git
```

```bash
cd villageeast-www && git checkout claude/initial-site && npm install
```

## 1. Supabase: create the project

1. Go to <https://supabase.com/dashboard> and choose **New project**.
   - Name: `villageeast`. Region: **East US (North Virginia)**. Generate a strong database password
     and store it in your password manager.
2. When the project is ready, open **Project Settings > API Keys** and note:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`). **Save this.** The `abcdefgh` part is
     your *project ref*.
   - **Publishable key** (`sb_publishable_...`). **Save this.** It is safe to expose.
   - **Secret key** (`sb_secret_...`). **Save this** somewhere private. It bypasses all security rules;
     never put it in the repository or in chat.

### 1a. Create the tables and security rules

```bash
npx supabase login
```

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

```bash
npx supabase db push --remote
```

`--remote` targets the linked project (without it the CLI aims at a local database). `db push` applies the two files in `supabase/migrations/`. It should end with "Finished supabase db push".

### 1b. Lock down sign-in

In the Supabase dashboard, under **Authentication**:

1. **Sign In / Providers**
   - Turn **off** "Allow new users to sign up". (Accounts are created only by an administrator, so a
     sign-in code can never be emailed to a stranger.)
   - Under **Email**: keep it enabled, set **Email OTP Expiration** to `600` seconds and
     **Email OTP Length** to `6`.
2. **URL Configuration**
   - **Site URL**: `https://villageeast.toston.io`
3. **Emails > Templates > Magic Link**
   - Subject: `Your Village East sign-in code`
   - Body: paste the whole contents of `supabase/templates/magic_link.html`.

## 2. Resend: email

1. At <https://resend.com/domains>, choose **Add Domain** and enter `villageeast.toston.io`
   (a subdomain keeps this separate from any other mail for toston.io).
2. Resend shows three or four DNS records. Add each one in the Cloudflare dashboard under
   **toston.io > DNS > Records**, exactly as shown. For every record set **Proxy status** to
   **DNS only** (grey cloud). Then press **Verify** in Resend.
3. At <https://resend.com/api-keys>, create a key named `villageeast` with **Sending access** only,
   restricted to that domain. **Save this** (`re_...`).
4. Back in Supabase: **Authentication > Emails > SMTP Settings**, enable custom SMTP:

   | Field | Value |
   |---|---|
   | Sender email | `noreply@villageeast.toston.io` |
   | Sender name | `Village East` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | your Resend API key |

The site itself only ever emails addresses listed in `MAIL_ALLOWLIST` (see step 4), and Supabase only
emails sign-in codes to accounts an administrator created. Together these mean the demo cannot email
anyone but you.

## 3. Cloudflare Turnstile: bot protection

1. Cloudflare dashboard > **Turnstile** > **Add widget**.
2. Name `villageeast`, hostname `villageeast.toston.io`, mode **Managed**.
3. **Save this:** the **Site Key** and the **Secret Key**.

## 4. Cloudflare Workers: deploy the site

1. Open `wrangler.jsonc` and replace the three placeholders in `vars`:
   - `SUPABASE_URL`: your Project URL
   - `SUPABASE_PUBLISHABLE_KEY`: your publishable key
   - `TURNSTILE_SITE_KEY`: your Turnstile site key

   Leave `MAIL_ALLOWLIST` and `ADMIN_NOTIFY_EMAIL` as your own address for the demo. Commit this change;
   none of these values are secret.
2. Sign in and deploy:

```bash
npx wrangler login
```

```bash
npm run deploy
```

   Because `toston.io` is already in your Cloudflare account, the deploy creates the DNS record and
   certificate for `villageeast.toston.io` automatically.
3. Add the three secrets (each command prompts you to paste the value):

```bash
npx wrangler secret put SUPABASE_SECRET_KEY
```

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

```bash
npx wrangler secret put RESEND_API_KEY
```

4. Recommended zone settings for `toston.io` (**SSL/TLS > Edge Certificates**): turn on
   **Always Use HTTPS** and set **Minimum TLS Version** to 1.2.

## 5. Load the content and create your administrator account

Create a file named `.env.seed` in the project folder (it is gitignored):

```
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
ADMIN_EMAIL=you@example.com
ADMIN_NAME=Your Name
ADMIN_LOT=s2-26
```

`ADMIN_LOT=s2-26` is 105 Camelot Drive (Section 2, Lot 26). Then:

```bash
npm run gis:sync
```

```bash
npm run seed
```

`gis:sync` pulls current parcel data from Bedford County (owner names go to a gitignored file, never
into the repository). `seed` uploads the 96 documents to private storage, loads lots, events, news, the
Social Club survey and a demonstration ballot, and creates your administrator account. Both are safe to
re-run. Delete `.env.seed` afterwards if you like.

## 6. Try it

1. Open <https://villageeast.toston.io> and choose **Owner sign in**.
2. Enter your email. A 6-digit code arrives within a few seconds; enter it.
3. You land in the member area. The **Admin** button in the header opens the admin tools.

A quick tour for showing others: **Community map** (tap a lot), **Financials** (click through the
years), **Voting** (cast the demo ballot), the dues reminder on the member overview, **My requests > Architectural review request**, then
**Admin > Surveys** for the live tallies and **Admin > Dues** to record a payment.

## 7. Optional extras

- **Photos.** `bash scripts/fetch-legacy-photos.sh` saves the old site's original images to
  `content/photos/legacy/` (kept in the repository, not deployed). The site uses web-sized copies in
  `public/photos/` (`hero.jpg` plus one per amenity). To swap one, export a JPEG about 800 px wide
  (1800 px for the hero) over the file of the same name, commit and redeploy.
- **Automatic deploys.** Cloudflare dashboard > Workers > `villageeast-www` > Settings > **Builds** >
  connect the GitHub repository, with build command `npm run build` and deploy command
  `npx wrangler deploy`. Every push to the main branch then deploys itself.
- **Keep the free database awake.** Supabase pauses free projects after about a week of inactivity.
  `.github/workflows/keepalive.yml` loads a page twice a week to prevent that; it starts working once
  this branch is merged into the default branch.
- **Adding people for the demo.** Admin > Members > Add a member creates the account. To let them
  receive sign-in codes, nothing else is needed (codes are sent by Supabase). To let them receive
  notification emails as well, add their address to `MAIL_ALLOWLIST` in `wrangler.jsonc` and redeploy.

## Local development

```bash
npx supabase start
```

```bash
cp .dev.vars.example .dev.vars
```

Fill `.dev.vars` with the keys printed by `npx supabase status`, then:

```bash
ADMIN_EMAIL=you@example.com ADMIN_LOT=s2-26 npm run seed
```

```bash
npm run dev
```

Sign-in emails for the local stack appear in Mailpit at <http://127.0.0.1:54324>.
Checks: `npm run check` (types), `npm test` (unit tests), and the database security tests in
`supabase/tests/rls.sql`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Every page shows "Missing configuration: ..." | A placeholder is still in `wrangler.jsonc`, or a secret from step 4.3 is missing. |
| No sign-in email arrives | The account does not exist (run the seed, or add the member), the Resend domain is not verified yet, or the SMTP password is wrong. Check **Authentication > Logs** in Supabase. |
| "We could not confirm you are human" | The Turnstile widget's hostname list does not include the site, or the secret key is wrong. |
| Documents give "temporarily unavailable" | The seed has not uploaded files yet, or `SUPABASE_SECRET_KEY` is wrong. |
| Site worked, then stopped after a quiet week | The Supabase project paused. Restore it from the dashboard and enable the keep-alive workflow. |
