import { admin } from "@/lib/supabase/admin";
import { ok, bad, requirePlayer } from "@/lib/api";
import { supabaseServer } from "@/lib/supabase/server";

// After Supabase Auth verifies the phone (or OAuth link), mirror the verified phone onto the player
// profile and record marketing consent SEPARATELY (spec §7: prize/persistence use is kept distinct
// from marketing consent).
export async function POST(req: Request) {
  const playerId = await requirePlayer();
  if (!playerId) return bad("not signed in", 401);
  const { marketingOptIn } = (await req.json().catch(() => ({}))) as { marketingOptIn?: boolean };

  // Read the now-verified contact from the auth user.
  const { data: userData } = await supabaseServer().auth.getUser();
  const phone = userData.user?.phone || null;

  const patch: Record<string, unknown> = {};
  if (phone) {
    patch.phone = phone;
    patch.phone_verified_at = new Date().toISOString();
  }
  if (marketingOptIn) {
    patch.marketing_opt_in = true;
    patch.marketing_opt_in_at = new Date().toISOString();
  }
  if (Object.keys(patch).length === 0) return ok({ claimed: false });

  const { error } = await admin().from("players").update(patch).eq("id", playerId);
  if (error) return bad(error.message, 500);
  return ok({ claimed: true, phone });
}
