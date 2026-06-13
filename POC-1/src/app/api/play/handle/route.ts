import { admin } from "@/lib/supabase/admin";
import { ok, bad, requirePlayer } from "@/lib/api";

// One-tap handle edit (spec §5: auto-handle "tweakable with one tap").
export async function POST(req: Request) {
  const playerId = await requirePlayer();
  if (!playerId) return bad("not signed in", 401);
  const { handle } = (await req.json().catch(() => ({}))) as { handle?: string };
  const clean = (handle ?? "").trim().slice(0, 24);
  if (clean.length < 2) return bad("handle too short");

  const { error } = await admin().from("players").update({ handle: clean }).eq("id", playerId);
  if (error) return bad(error.message, 500);
  return ok({ handle: clean });
}
