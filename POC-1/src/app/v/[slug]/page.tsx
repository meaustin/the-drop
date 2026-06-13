import { notFound } from "next/navigation";
import { admin } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { VenueClient } from "@/components/play/VenueClient";

export const dynamic = "force-dynamic";

export default async function VenuePlayPage({ params }: { params: { slug: string } }) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="grid min-h-[100dvh] place-items-center px-6 text-center text-muted">
        Supabase isn’t configured yet. See README.md to add your keys and seed venues.
      </main>
    );
  }
  const { data: venue } = await admin()
    .from("venues")
    .select("id, slug, name, tagline")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!venue) notFound();

  return <VenueClient venue={venue} />;
}
