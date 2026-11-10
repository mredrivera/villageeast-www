import { env as cfEnv } from 'cloudflare:workers';

type Bindings = {
  SITE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_ALLOWLIST?: string;
  ADMIN_NOTIFY_EMAIL?: string;
  FORM_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
};

const raw = cfEnv as unknown as Bindings;

function required(name: keyof Bindings): string {
  const value = raw[name];
  if (typeof value !== 'string' || value === '' || value.includes('REPLACE_ME') || value.includes('YOUR-PROJECT-REF')) {
    throw new Error(`Missing configuration: ${name}. See docs/SETUP.md.`);
  }
  return value;
}

export const config = {
  get siteUrl() { return required('SITE_URL').replace(/\/$/, ''); },
  get supabaseUrl() { return required('SUPABASE_URL'); },
  get supabasePublishableKey() { return required('SUPABASE_PUBLISHABLE_KEY'); },
  get supabaseSecretKey() { return required('SUPABASE_SECRET_KEY'); },
  get turnstileSiteKey() { return required('TURNSTILE_SITE_KEY'); },
  get turnstileSecretKey() { return required('TURNSTILE_SECRET_KEY'); },
  get resendApiKey() { return raw.RESEND_API_KEY || null; },
  get mailFrom() { return raw.MAIL_FROM || 'Village East <onboarding@resend.dev>'; },
  /** Lower-cased addresses the site is permitted to email. Empty list = send to nobody. */
  get mailAllowlist() {
    return (raw.MAIL_ALLOWLIST ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  },
  get adminNotifyEmail() { return raw.ADMIN_NOTIFY_EMAIL || null; },
  get formLimiter() { return raw.FORM_LIMITER ?? null; },
  get isSecure() { return required('SITE_URL').startsWith('https://'); },
};
