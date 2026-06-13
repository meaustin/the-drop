import "server-only";
import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";

export const ok = (data: unknown = { ok: true }) => NextResponse.json(data);
export const bad = (message: string, status = 400) =>
  NextResponse.json({ ok: false, error: message }, { status });

/** Resolve the current player (auth user). Returns null if unauthenticated. */
export async function requirePlayer(): Promise<string | null> {
  return currentUserId();
}

/** True if the current user has at least the given role at the venue (owner > manager > staff). */
export async function hasVenueRole(
  userId: string,
  venueId: string,
  min: "owner" | "manager" | "staff" = "staff"
): Promise<boolean> {
  const { data } = await admin()
    .from("venue_members")
    .select("role")
    .eq("venue_id", venueId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return false;
  const rank = { staff: 1, manager: 2, owner: 3 } as const;
  return rank[data.role as keyof typeof rank] >= rank[min];
}

export async function venueIdFromSlug(slug: string): Promise<string | null> {
  const { data } = await admin().from("venues").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}
