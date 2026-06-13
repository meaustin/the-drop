"use client";
import { useState } from "react";
import { Leaderboard } from "./Leaderboard";
import type { LeaderboardRow, PrizePublic } from "@/lib/types";

export type RestingData = {
  venue: { name: string; tagline: string | null };
  prizes: PrizePublic[];
  leaderboards: { tonight: LeaderboardRow[]; week: LeaderboardRow[] };
  recentWinners: { handle: string; prize: string; at: string }[];
  stats: { playersTonight: number };
};

export function RestingScreen({
  data,
  handle,
  claimed,
  presence,
  canInstall,
  onEditHandle,
  onInstall,
  onClaim,
}: {
  data: RestingData;
  handle: string | null;
  claimed: boolean;
  presence: number;
  canInstall: boolean;
  onEditHandle: () => void;
  onInstall: () => void;
  onClaim: () => void;
}) {
  const [tab, setTab] = useState<"tonight" | "week">("tonight");
  const rows = tab === "tonight" ? data.leaderboards.tonight : data.leaderboards.week;
  const myRank = rows.findIndex((r) => r.handle === handle);
  const aheadGap =
    myRank > 0 ? rows[myRank - 1].points - rows[myRank].points : null;

  return (
    <div className="mx-auto max-w-md px-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black leading-tight">{data.venue.name}</h1>
          {data.venue.tagline && <p className="text-xs text-muted">{data.venue.tagline}</p>}
        </div>
        <button onClick={onEditHandle} className="pill">
          <span className="text-white">{handle ?? "…"}</span> ✏️
        </button>
      </div>

      {/* Live presence + next-drop anticipation */}
      <div className="card mt-4 overflow-hidden p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-good" />
            <span className="font-semibold">{Math.max(presence, 1)} here now</span>
          </div>
          <span className="text-xs text-muted tnum">{data.stats.playersTonight} played today</span>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-panel2/60 px-3 py-3">
          <div className="relative">
            <span className="absolute inset-0 animate-pulse-ring rounded-full bg-drop/40" />
            <span className="relative grid h-9 w-9 place-items-center rounded-full bg-drop text-lg">🎯</span>
          </div>
          <div className="text-sm">
            <div className="font-semibold">A drop could hit any minute</div>
            <div className="text-muted">Keep this open — the whole room plays at once.</div>
          </div>
        </div>
      </div>

      {/* Prize callout */}
      {data.prizes.length > 0 && (
        <div className="mt-3 rounded-2xl border border-gold/30 bg-gold/5 p-3">
          <div className="label text-gold">On the line</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {data.prizes.map((p) => (
              <span key={p.id} className="pill border-gold/40 text-gold">
                🎁 {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboards */}
      <div className="card mt-4 p-4">
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setTab("tonight")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
              tab === "tonight" ? "bg-accent text-white" : "bg-panel2 text-muted"
            }`}
          >
            Tonight
          </button>
          <button
            onClick={() => setTab("week")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
              tab === "week" ? "bg-accent text-white" : "bg-panel2 text-muted"
            }`}
          >
            This Week
          </button>
        </div>
        <Leaderboard rows={rows} meHandle={handle} />
        {aheadGap != null && aheadGap >= 0 && (
          <p className="mt-3 text-center text-sm text-accent">
            You&apos;re {aheadGap + 1} point{aheadGap === 0 ? "" : "s"} off the next spot — one good drop.
          </p>
        )}
      </div>

      {/* Recent winners */}
      {data.recentWinners.length > 0 && (
        <div className="mt-4">
          <div className="label px-1">Recent winners</div>
          <div className="mt-2 space-y-1.5">
            {data.recentWinners.slice(0, 4).map((w, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-panel2/40 px-3 py-2 text-sm">
                <span>🏆 <span className="font-semibold">{w.handle}</span> won {w.prize}</span>
                <span className="text-xs text-muted">
                  {new Date(w.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progressive on-ramps */}
      <div className="mt-5 space-y-2">
        {!claimed && (
          <button onClick={onClaim} className="btn-ghost w-full text-sm">
            📱 Save your handle & points across visits
          </button>
        )}
        {canInstall && (
          <button onClick={onInstall} className="btn-ghost w-full text-sm">
            ⬇️ Add to home screen — get buzzed the second a drop hits
          </button>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted">The Drop · everyone plays at once</p>
    </div>
  );
}
