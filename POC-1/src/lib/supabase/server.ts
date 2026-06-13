import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PUBLIC_ENV } from "@/lib/env";

// Per-request server client bound to the auth cookies. Use this to read the *current user's*
// identity (getUser) and to do reads that should respect RLS. Privileged writes use admin().
export function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(PUBLIC_ENV.supabaseUrl, PUBLIC_ENV.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component where cookies are read-only — safe to ignore;
          // middleware handles the refresh write.
        }
      },
    },
  });
}

/** Returns the authenticated user id (player id) or null. */
export async function currentUserId(): Promise<string | null> {
  const sb = supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}
