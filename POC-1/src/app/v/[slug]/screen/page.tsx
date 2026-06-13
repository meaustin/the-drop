import { notFound } from "next/navigation";
import { admin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, PUBLIC_ENV } from "@/lib/env";
import { HouseScreen } from "@/components/screen/HouseScreen";

export const dynamic = "force-dynamic";

// The optional "house screen" — just a URL the venue throws on any TV (spec §8). No login; an
// unguessable token may be required if the venue enabled it.
export default async function ScreenPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { t?: string };
}) {
  if (!isSupabaseConfigured()) return notFound();

  const { data: venue } = await admin()
    .from("venues")
    .select("id, slug, name, tagline, house_screen_token, house_screen_enabled")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!venue) notFound();

  // If a token is set and provided, validate it; otherwise allow (token gating is opt-in).
  if (searchParams.t && searchParams.t !== venue.house_screen_token) notFound();

  const joinUrl = `${PUBLIC_ENV.appBaseUrl}/v/${venue.slug}`;
  return (
    <HouseScreen
      venue={{ id: venue.id, slug: venue.slug, name: venue.name, tagline: venue.tagline }}
      joinUrl={joinUrl}
    />
  );
}
