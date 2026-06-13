"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_ENV } from "@/lib/env";

let _client: SupabaseClient | null = null;

// Singleton browser client (shared auth cookie + one realtime socket per tab).
export function supabaseBrowser(): SupabaseClient {
  if (_client) return _client;
  _client = createBrowserClient(PUBLIC_ENV.supabaseUrl, PUBLIC_ENV.supabaseAnonKey);
  return _client;
}
