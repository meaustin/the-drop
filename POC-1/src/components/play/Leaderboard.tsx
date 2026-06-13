"use client";
import type { LeaderboardRow } from "@/lib/types";

const medal = ["🥇", "🥈", "🥉"];

export function Leaderboard({
  rows,
  meHandle,
  emptyHint,
}: {
  rows: LeaderboardRow[];
  meHandle?: string | null;
  emptyHint?: string;
}) {
  if (!rows.length) {
    return (
      <div className="px-1 py-6 text-center text-sm text-muted">
        {emptyHint ?? "No scores yet — the first drop sets the board."}
      </div>
    );
  }
  return (
    <ol className="space-y-1.5">
      {rows.map((r, i) => {
        const isMe = meHandle && r.handle === meHandle;
        return (
          <li
            key={r.player_id}
            className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
              isMe ? "border border-accent/60 bg-accent/10" : "bg-panel2/60"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-6 text-center text-sm tnum text-muted">
                {i < 3 ? medal[i] : r.rank}
              </span>
              <span className="font-semibold">
                {r.handle}
                {isMe && <span className="ml-2 text-xs text-accent">you</span>}
              </span>
            </div>
            <span className="tnum font-bold text-gold">{r.points.toLocaleString()}</span>
          </li>
        );
      })}
    </ol>
  );
}
