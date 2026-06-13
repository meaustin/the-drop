import { admin } from "@/lib/supabase/admin";
import { ok, bad, requirePlayer, hasVenueRole } from "@/lib/api";

// The human-review queue (spec §9): pending questions for this venue or the global library, WITH
// answers (reviewers must see the key to approve). Service-role read; never exposed to patrons.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await requirePlayer();
  if (!userId) return bad("not signed in", 401);
  if (!(await hasVenueRole(userId, params.id, "manager"))) return bad("forbidden", 403);

  const { data } = await admin()
    .from("questions")
    .select("id, format, prompt, options, correct_option, correct_number, unit, category, difficulty, source, ambiguity_score, venue_id")
    .eq("status", "pending_review")
    .or(`venue_id.eq.${params.id},venue_id.is.null`)
    .order("ambiguity_score", { ascending: false, nullsFirst: false })
    .limit(50);

  return ok({ questions: data ?? [] });
}
