import { revealDrop } from "@/lib/engine";
import { ok, bad } from "@/lib/api";

// Idempotent, time-guarded reveal. The first client whose countdown hits zero calls this; the cron
// reconciler also calls it. revealDrop() only acts once closes_at has passed (no `force` here), so an
// early or repeated call is harmless.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const result = await revealDrop(params.id);
  if (!result.ok) return bad(result.reason, 409);
  return ok({ reveal: result.reveal });
}
