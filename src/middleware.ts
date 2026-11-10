import { defineMiddleware } from 'astro:middleware';
import { isMember, isStaff, type Profile } from '~/lib/auth';
import { applySecurityHeaders } from '~/lib/security';
import { createUserClient } from '~/lib/supabase';

const PROFILE_COLUMNS = 'id,email,full_name,phone,lot_id,role,status,directory_opt_in,directory_show_email,directory_show_phone';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request, cookies, locals } = context;
  const path = url.pathname;
  const membersOnly = path === '/members' || path.startsWith('/members/');
  const staffOnly = path === '/admin' || path.startsWith('/admin/');

  locals.user = null;
  locals.profile = null;
  locals.supabase = createUserClient(request, cookies);

  // Only talk to the auth server when the visitor actually presents a session cookie.
  if (/(?:^|;\s*)sb-[^=]*-auth-token/.test(request.headers.get('cookie') ?? '')) {
    const { data, error } = await locals.supabase.auth.getUser();
    if (!error && data.user) {
      locals.user = data.user;
      const { data: profile } = await locals.supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', data.user.id).maybeSingle();
      locals.profile = (profile as Profile | null) ?? null;
    }
  }

  if (membersOnly || staffOnly) {
    if (!locals.user) {
      return finish(context.redirect(`/auth/sign-in?next=${encodeURIComponent(path + url.search)}`, 303), true);
    }
    if (!isMember(locals.profile)) return finish(context.redirect('/auth/pending', 303), true);
    if (staffOnly && !isStaff(locals.profile)) return finish(new Response('Not found', { status: 404 }), true);
  }

  return finish(await next(), membersOnly || staffOnly || locals.user !== null || path.startsWith('/auth/'));
});

function finish(response: Response, privateContent: boolean): Response {
  // Redirect responses can have immutable headers; copy before decorating.
  const out = new Response(response.body, response);
  applySecurityHeaders(out.headers, { privateContent });
  return out;
}
