import { createClient } from "@supabase/supabase-js";

// Server-only client that uses the service role key and bypasses RLS. Never import this from a client component.
// Used for writes that users must not be able to make themselves (Tradera cache, auction history, search log).
// Returns null when SUPABASE_SERVICE_ROLE_KEY is not set, so callers can skip the write instead of failing.
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
