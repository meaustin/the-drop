import { admin } from "@/lib/supabase/admin";
import { ok, bad, requirePlayer } from "@/lib/api";

// Store a Web Push subscription for the current player's device (one row per endpoint).
export async function POST(req: Request) {
  const playerId = await requirePlayer();
  if (!playerId) return bad("not signed in", 401);
  const body = await req.json().catch(() => null);
  if (!body?.endpoint || !body?.p256dh || !body?.auth) return bad("invalid subscription");

  const { error } = await admin()
    .from("push_subscriptions")
    .upsert(
      {
        player_id: playerId,
        endpoint: body.endpoint,
        p256dh: body.p256dh,
        auth: body.auth,
        user_agent: body.userAgent ?? null,
      },
      { onConflict: "endpoint" }
    );
  if (error) return bad(error.message, 500);
  return ok();
}
