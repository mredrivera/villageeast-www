import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import { config } from './env';

/**
 * Client bound to the visitor's session. It carries the visitor's own JWT, so Postgres row-level
 * security decides what it can see. Session cookies are HttpOnly: page JavaScript never sees tokens.
 */
export function createUserClient(request: Request, cookies: AstroCookies): SupabaseClient {
  return createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookieOptions: { httpOnly: true, secure: config.isSecure, sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () =>
        parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => ({ name, value: value ?? '' })),
      setAll: (items) => {
        for (const { name, value, options } of items) {
          try {
            cookies.set(name, value, { ...options, httpOnly: true, secure: config.isSecure, sameSite: 'lax', path: '/' });
          } catch {
            // Response already started streaming; the refreshed session is picked up on the next request.
          }
        }
      },
    },
  });
}

/**
 * Privileged client that bypasses row-level security. Server-only, and only ever used after the
 * caller has been authorised (admin actions, signing storage URLs, writing public form posts).
 */
export function createServiceClient(): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function audit(
  actor: string | null,
  action: string,
  entity?: string,
  entityId?: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await createServiceClient()
    .from('audit_log')
    .insert({ actor, action, entity: entity ?? null, entity_id: entityId ?? null, meta });
  if (error) console.error('audit failed', action, error.message);
}
