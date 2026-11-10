import { config } from './env';

/**
 * Strict Content-Security-Policy. No inline or third-party script except Cloudflare Turnstile.
 * The community map is fully self-hosted (county data + local fonts), so no tile hosts are needed.
 */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'", // charting/map libraries position elements with style attributes
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    'frame-src https://challenges.cloudflare.com',
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(config.isSecure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export function applySecurityHeaders(headers: Headers, { privateContent }: { privateContent: boolean }): void {
  headers.set('Content-Security-Policy', contentSecurityPolicy());
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (config.isSecure) headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  if (privateContent) {
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
}

/** Best-effort per-IP throttle using the Workers Rate Limiting binding (no-op when not configured). */
export async function rateLimitOk(request: Request, bucket: string): Promise<boolean> {
  const limiter = config.formLimiter;
  if (!limiter) return true;
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  try {
    return (await limiter.limit({ key: `${bucket}:${ip}` })).success;
  } catch {
    return true;
  }
}

export async function verifyTurnstile(request: Request, token: FormDataEntryValue | null): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;
  const body = new FormData();
  body.set('secret', config.turnstileSecretKey);
  body.set('response', token);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error('turnstile verify failed', err);
    return false;
  }
}
