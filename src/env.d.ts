/// <reference types="astro/client" />
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Profile } from '~/lib/auth';

declare global {
  namespace App {
    interface Locals {
      /** Supabase client bound to the visitor's session cookies; all queries are subject to RLS. */
      supabase: SupabaseClient;
      user: User | null;
      profile: Profile | null;
    }
  }
}
export {};
