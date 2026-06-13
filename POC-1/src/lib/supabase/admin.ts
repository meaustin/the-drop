import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireServerEnv } from "@/lib/env";

// Service-role client: bypasses RLS. ONLY ever imported in server code (Route Handlers, scripts).
// This is the "server-authoritative" actor — it grades answers, picks winners, schedules drops, and
// is the only thing permitted to read the answer key in public.questions.
let _admin: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (_admin) return _admin;
  const { url, serviceKey } = requireServerEnv();
  _admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}
