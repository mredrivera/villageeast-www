import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ locals, redirect }) => {
  await locals.supabase.auth.signOut();
  return redirect('/?ok=' + encodeURIComponent('You have been signed out.'), 303);
};
