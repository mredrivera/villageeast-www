import type { APIRoute } from 'astro';
import { createServiceClient } from '~/lib/supabase';

/** Attachment download: visible only if RLS lets this member see the parent request. */
export const GET: APIRoute = async ({ params, locals }) => {
  const id = params.id ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const { data: file } = await locals.supabase.from('submission_files').select('storage_path,file_name').eq('id', id).maybeSingle();
  if (!file) return new Response('Not found', { status: 404 });
  const { data, error } = await createServiceClient().storage.from('submissions').createSignedUrl(file.storage_path, 60, { download: file.file_name });
  if (error || !data) return new Response('This file is temporarily unavailable.', { status: 503 });
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, 'Cache-Control': 'private, no-store' } });
};
