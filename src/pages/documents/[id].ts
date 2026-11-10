import type { APIRoute } from 'astro';
import { createServiceClient } from '~/lib/supabase';

/**
 * Authorised download. The row is looked up with the visitor's own credentials, so row-level
 * security decides whether they may see it; only then is a 60-second signed URL issued for the
 * private storage object.
 */
export const GET: APIRoute = async ({ params, locals, url, redirect }) => {
  const id = params.id ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return new Response('Not found', { status: 404 });

  const { data: doc } = await locals.supabase.from('documents').select('storage_path,file_name').eq('id', id).maybeSingle();
  if (!doc) {
    if (!locals.user) return redirect(`/auth/sign-in?next=${encodeURIComponent(url.pathname)}`, 303);
    return new Response('Not found', { status: 404 });
  }
  const { data, error } = await createServiceClient().storage.from('documents')
    .createSignedUrl(doc.storage_path, 60, url.searchParams.has('download') ? { download: doc.file_name } : undefined);
  if (error || !data) {
    console.error('sign document url', error?.message);
    return new Response('This document is temporarily unavailable.', { status: 503 });
  }
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, 'Cache-Control': 'private, no-store' } });
};
