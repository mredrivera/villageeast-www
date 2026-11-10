import type { AstroCookies } from 'astro';
import { config } from './env';

/** Short-lived, HttpOnly cookie remembering which email a code was sent to (keeps it out of URLs and logs). */
const NAME = 've_login';
export function rememberLogin(cookies: AstroCookies, email: string, next: string) {
  cookies.set(NAME, JSON.stringify({ email, next }), { httpOnly: true, secure: config.isSecure, sameSite: 'lax', path: '/auth', maxAge: 900 });
}
export function recallLogin(cookies: AstroCookies): { email: string; next: string } | null {
  try {
    const v = cookies.get(NAME)?.json() as { email?: unknown; next?: unknown } | undefined;
    return typeof v?.email === 'string' && typeof v.next === 'string' ? { email: v.email, next: v.next } : null;
  } catch { return null; }
}
export const forgetLogin = (cookies: AstroCookies) => cookies.delete(NAME, { path: '/auth' });
