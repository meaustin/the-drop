import { admin } from "@/lib/supabase/admin";
import { ok, bad, requirePlayer, hasVenueRole } from "@/lib/api";
import { fireDrop } from "@/lib/engine";
import { PUBLIC_ENV } from "@/lib/env";

// ---- GET: the full admin dashboard payload for one venue ----
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await requirePlayer();
  if (!userId) return bad("not signed in", 401);
  if (!(await hasVenueRole(userId, params.id, "staff"))) return bad("forbidden", 403);
  const sb = admin();

  const [venue, settings, windows, prizes, packs, venuePacks, pending, recentDrops, openRedemptions] =
    await Promise.all([
      sb.from("venues").select("*").eq("id", params.id).single(),
      sb.from("venue_settings").select("*").eq("venue_id", params.id).single(),
      sb.from("venue_active_windows").select("*").eq("venue_id", params.id).order("day_of_week"),
      sb.from("prizes").select("*").eq("venue_id", params.id).order("created_at"),
      sb.from("packs").select("*").order("name"),
      sb.from("venue_packs").select("pack_id, enabled").eq("venue_id", params.id),
      sb.from("questions").select("id", { count: "exact", head: true }).eq("status", "pending_review").or(`venue_id.eq.${params.id},venue_id.is.null`),
      sb.from("drops").select("id, is_prize_drop, status, started_at, question_id").eq("venue_id", params.id).order("started_at", { ascending: false }).limit(8),
      sb.from("redemptions").select("id, code, status, player_id, prize_id, issued_at, expires_at").eq("venue_id", params.id).eq("status", "issued").order("issued_at", { ascending: false }).limit(10),
    ]);

  if (venue.error || !venue.data) return bad("venue not found", 404);

  const enabledMap = new Map((venuePacks.data ?? []).map((p: any) => [p.pack_id, p.enabled]));
  const packsWithState = (packs.data ?? []).map((p: any) => ({ ...p, enabled: enabledMap.get(p.id) ?? false }));

  return ok({
    venue: venue.data,
    settings: settings.data,
    windows: windows.data ?? [],
    prizes: prizes.data ?? [],
    packs: packsWithState,
    pendingReview: pending.count ?? 0,
    recentDrops: recentDrops.data ?? [],
    openRedemptions: openRedemptions.data ?? [],
    links: {
      joinUrl: `${PUBLIC_ENV.appBaseUrl}/v/${venue.data.slug}`,
      screenUrl: `${PUBLIC_ENV.appBaseUrl}/v/${venue.data.slug}/screen?t=${venue.data.house_screen_token}`,
    },
  });
}

// ---- POST: one action endpoint for all venue mutations ----
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await requirePlayer();
  if (!userId) return bad("not signed in", 401);
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  // staff may only confirm redemptions; manager/owner do everything else.
  const minRole = action === "redeem" ? "staff" : "manager";
  if (!(await hasVenueRole(userId, params.id, minRole as any))) return bad("forbidden", 403);
  const sb = admin();

  switch (action) {
    case "status": {
      const status = body.status;
      if (!["setup", "active", "paused"].includes(status)) return bad("bad status");
      await sb.from("venues").update({ status }).eq("id", params.id);
      return ok({ status });
    }
    case "settings": {
      const allowed = [
        "drops_per_hour", "min_minutes_between_drops", "countdown_seconds", "base_points",
        "max_speed_bonus", "prize_drops_per_day", "daily_prize_cap", "prize_cooldown_minutes",
        "redemption_ttl_minutes", "question_repeat_cooldown_days",
      ];
      const patch: Record<string, number> = {};
      for (const k of allowed) if (typeof body[k] === "number") patch[k] = body[k];
      if (Object.keys(patch).length === 0) return bad("nothing to update");
      await sb.from("venue_settings").update(patch).eq("venue_id", params.id);
      return ok(patch);
    }
    case "fire": {
      const res = await fireDrop(params.id, { forcePrize: Boolean(body.prize) });
      return res.ok ? ok({ drop: res.drop }) : bad(res.reason, 409);
    }
    case "prize_upsert": {
      const { id, name, description, is_active } = body;
      if (id) {
        await sb.from("prizes").update({ name, description, is_active }).eq("id", id).eq("venue_id", params.id);
        return ok({ id });
      }
      const { data } = await sb.from("prizes").insert({ venue_id: params.id, name, description }).select("id").single();
      return ok({ id: data?.id });
    }
    case "prize_delete": {
      await sb.from("prizes").update({ is_active: false }).eq("id", body.id).eq("venue_id", params.id);
      return ok();
    }
    case "windows": {
      // Replace the whole window set.
      await sb.from("venue_active_windows").delete().eq("venue_id", params.id);
      const rows = (body.windows ?? [])
        .filter((w: any) => w.starts_at < w.ends_at)
        .map((w: any) => ({
          venue_id: params.id,
          day_of_week: w.day_of_week,
          starts_at: w.starts_at,
          ends_at: w.ends_at,
        }));
      if (rows.length) await sb.from("venue_active_windows").insert(rows);
      return ok({ count: rows.length });
    }
    case "pack_toggle": {
      await sb.from("venue_packs").upsert(
        { venue_id: params.id, pack_id: body.pack_id, enabled: Boolean(body.enabled) },
        { onConflict: "venue_id,pack_id" }
      );
      return ok();
    }
    case "redeem": {
      const code = String(body.code ?? "").trim().toUpperCase();
      if (!code) return bad("code required");
      const { data: r } = await sb
        .from("redemptions")
        .select("id, status, expires_at, prize_id, player_id")
        .eq("venue_id", params.id)
        .eq("code", code)
        .maybeSingle();
      if (!r) return bad("no matching code", 404);
      if (r.status === "redeemed") return bad("already redeemed", 409);
      if (r.status === "voided") return bad("voided", 409);
      if (new Date(r.expires_at).getTime() < Date.now()) {
        await sb.from("redemptions").update({ status: "expired" }).eq("id", r.id);
        return bad("expired", 409);
      }
      const { data: member } = await sb
        .from("venue_members").select("id").eq("venue_id", params.id).eq("user_id", userId).single();
      await sb
        .from("redemptions")
        .update({ status: "redeemed", redeemed_at: new Date().toISOString(), redeemed_by_member_id: member?.id })
        .eq("id", r.id);
      const { data: prize } = await sb.from("prizes").select("name").eq("id", r.prize_id).single();
      return ok({ redeemed: true, prize: prize?.name });
    }
    case "approve_question":
    case "reject_question": {
      const qid = body.questionId;
      const status = action === "approve_question" ? "approved" : "rejected";
      const patch: Record<string, unknown> = { status };
      if (status === "approved") {
        patch.approved_by = userId;
        patch.approved_at = new Date().toISOString();
      }
      await sb.from("questions").update(patch).eq("id", qid);
      return ok({ status });
    }
    case "flag_question": {
      // Dispute safety valve (spec §9): flag auto-pulls from rotation; optionally void the round.
      await sb.from("question_flags").insert({
        question_id: body.questionId,
        drop_id: body.dropId ?? null,
        flagged_by: userId,
        reason: body.reason ?? "flagged by staff",
      });
      if (body.dropId) {
        await sb.from("drops").update({ status: "voided" }).eq("id", body.dropId).eq("venue_id", params.id);
        await sb.from("redemptions").update({ status: "voided" }).eq("drop_id", body.dropId);
      }
      return ok({ flagged: true });
    }
    default:
      return bad("unknown action");
  }
}
