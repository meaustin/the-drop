import { admin } from "@/lib/supabase/admin";
import { ok, bad, requirePlayer } from "@/lib/api";

// Venues the current admin user belongs to (claim spine; data-model §A venue_members).
export async function GET() {
  const userId = await requirePlayer();
  if (!userId) return bad("not signed in", 401);

  const { data: memberships } = await admin()
    .from("venue_members")
    .select("role, venue_id, venues(id, slug, name, tagline, status)")
    .eq("user_id", userId);

  const venues = (memberships ?? []).map((m: any) => ({
    id: m.venues.id,
    slug: m.venues.slug,
    name: m.venues.name,
    tagline: m.venues.tagline,
    status: m.venues.status,
    role: m.role,
  }));
  return ok({ venues });
}
