import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Referenced literally so Next.js can inline them into the browser bundle.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Storage bucket for profile photos. Override with NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET. */
export const AVATAR_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET ?? "avatars";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

let client: SupabaseClient | null = null;

/**
 * The app's single browser Supabase client, or `null` when the public URL/key
 * env vars are missing. Only the publishable (anon) key is ever used here.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  client ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
