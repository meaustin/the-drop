"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { venueChannel, RT_EVENT } from "@/lib/realtime/channel";
import type { DropPayload, RevealPayload, LeaderboardRow } from "@/lib/types";
import { Countdown } from "@/components/play/Countdown";

const OPTION_LABELS = ["A", "B", "C", "D"];
type Phase = "rest" | "live" | "reveal";

export function HouseScreen({
  venue,
  joinUrl,
}: {
  venue: { id: string; slug: string; name: string; tagline: string | null };
  joinUrl: string;
}) {
  const sb = supabaseBrowser();
  const [phase, setPhase] = useState<Phase>("rest");
  const [drop, setDrop] = useState<DropPayload | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [winners, setWinners] = useState<{ handle: string; prize: string }[]>([]);
  const [prizes, setPrizes] = useState<{ name: string }[]>([]);
  const [lockedCount, setLockedCount] = useState(0);
  const [presence, setPresence] = useState(0);
  const [qr, setQr] = useState<string>("");
  const [timer, setTimer] = useState({ fraction: 1, secondsLeft: 0 });

  const deadline = useRef(0);
  const displayMs = useRef(1);
  const dropRef = useRef<DropPayload | null>(null);
  dropRef.current = drop;

  async function refresh() {
    const res = await fetch(`/api/v/${venue.slug}/state`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setBoard(data.leaderboards.tonight);
    setWinners(data.recentWinners);
    setPrizes(data.prizes);
    if (data.liveDrop && !dropRef.current) startDrop(data.liveDrop);
  }

  function startDrop(payload: DropPayload) {
    const now = Date.now();
    const windowMs = payload.countdownSeconds * 1000;
    const remaining = new Date(payload.closesAt).getTime() - now;
    const display = Math.min(windowMs, remaining);
    if (display <= 300) return;
    deadline.current = now + display;
    displayMs.current = display;
    setDrop(payload);
    setReveal(null);
    setLockedCount(0);
    setPhase("live");
  }

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 280, color: { dark: "#0a0a0f", light: "#ffffff" } }).then(setQr);
    refresh();
    const poll = setInterval(refresh, 15000);

    const channel = sb.channel(venueChannel(venue.id), { config: { presence: { key: "house-screen" } } });
    channel
      .on("broadcast", { event: RT_EVENT.drop }, ({ payload }) => startDrop(payload as DropPayload))
      .on("broadcast", { event: RT_EVENT.reveal }, ({ payload }) => {
        setReveal(payload as RevealPayload);
        setPhase("reveal");
        refresh();
        setTimeout(() => setPhase("rest"), 9000); // linger on the winner, then back to rest
      })
      .on("broadcast", { event: RT_EVENT.answered }, ({ payload }) => {
        if (dropRef.current && (payload as any)?.dropId === dropRef.current.dropId) setLockedCount((c) => c + 1);
      })
      .on("presence", { event: "sync" }, () => setPresence(Object.keys(channel.presenceState()).length))
      .subscribe(async (s) => {
        if (s === "SUBSCRIBED") await channel.track({ role: "screen" });
      });

    return () => {
      clearInterval(poll);
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue.id]);

  useEffect(() => {
    if (phase !== "live") return;
    let raf = 0;
    const loop = () => {
      const rem = deadline.current - Date.now();
      setTimer({ fraction: rem / displayMs.current, secondsLeft: rem / 1000 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ---------- RENDER ----------
  if (phase === "live" && drop) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center px-12 py-10 text-center">
        <div className="mb-6 flex items-center gap-4">
          <span className="rounded-full bg-drop px-5 py-2 text-xl font-black uppercase tracking-widest animate-pulse">
            {drop.isPrizeDrop ? "🎁 Prize Drop" : "⚡ Question Incoming"}
          </span>
          <span className="text-2xl text-muted tnum">{lockedCount} locked in</span>
        </div>
        <div className="mb-8">
          <Countdown fraction={timer.fraction} secondsLeft={timer.secondsLeft} size={220} />
        </div>
        <h1 className="max-w-5xl text-balance text-6xl font-black leading-tight">{drop.prompt}</h1>
        {drop.format !== "closest_guess" && (
          <div className="mt-10 grid max-w-5xl grid-cols-2 gap-5">
            {(drop.options ?? []).map((o, i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl border border-edge bg-panel2 px-6 py-5 text-3xl font-bold">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink text-2xl text-muted">
                  {OPTION_LABELS[i]}
                </span>
                {o}
              </div>
            ))}
          </div>
        )}
        {drop.isPrizeDrop && drop.prize && (
          <p className="mt-8 text-3xl text-gold">Fastest correct wins {drop.prize.name} 🏆</p>
        )}
      </main>
    );
  }

  if (phase === "reveal" && drop && reveal) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center px-12 text-center animate-drop-in">
        {reveal.isPrizeDrop && reveal.winner ? (
          <>
            <div className="text-8xl animate-pop">🏆</div>
            <div className="mt-4 text-3xl text-muted">Winner</div>
            <h1 className="mt-2 text-7xl font-black text-gold">{reveal.winner.handle}</h1>
            <p className="mt-3 text-3xl text-muted tnum">
              {(reveal.winner.elapsedMs / 1000).toFixed(2)}s · fastest in the room
            </p>
          </>
        ) : (
          <>
            <div className="text-7xl">✅</div>
            <h1 className="mt-4 text-5xl font-black text-good">
              {reveal.format === "closest_guess"
                ? `${reveal.correctNumber}${reveal.unit ? " " + reveal.unit : ""}`
                : drop.options?.[reveal.correctOption ?? 0]}
            </h1>
          </>
        )}
        <p className="mt-6 text-2xl text-muted">{reveal.answerCount} played this drop</p>
      </main>
    );
  }

  // REST
  return (
    <main className="flex min-h-[100dvh] gap-10 px-12 py-10">
      <section className="flex flex-1 flex-col">
        <h1 className="text-6xl font-black">{venue.name}</h1>
        {venue.tagline && <p className="mt-1 text-2xl text-muted">{venue.tagline}</p>}
        <div className="mt-6 flex items-center gap-3">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-good" />
          <span className="text-2xl">A question drops any minute — everyone plays at once</span>
        </div>
        {prizes.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {prizes.map((p, i) => (
              <span key={i} className="rounded-full border border-gold/40 bg-gold/10 px-5 py-2 text-2xl text-gold">
                🎁 {p.name}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-6 pt-8">
          {qr && <img src={qr} alt="Scan to play" className="h-44 w-44 rounded-2xl bg-white p-2" />}
          <div>
            <div className="text-3xl font-bold">Scan to play</div>
            <div className="text-xl text-muted">No app, no signup — you&apos;re in instantly</div>
            <div className="mt-2 text-lg text-muted">{presence > 0 ? `${presence} screens watching` : ""}</div>
          </div>
        </div>
      </section>

      <section className="w-[40%]">
        <div className="card h-full p-6">
          <div className="mb-4 text-3xl font-black">Tonight&apos;s Leaderboard</div>
          <ol className="space-y-2">
            {board.slice(0, 10).map((r, i) => (
              <li key={r.player_id} className="flex items-center justify-between rounded-xl bg-panel2/60 px-4 py-3 text-2xl">
                <span className="flex items-center gap-3">
                  <span className="w-8 text-center text-muted tnum">{i < 3 ? ["🥇", "🥈", "🥉"][i] : r.rank}</span>
                  <span className="font-bold">{r.handle}</span>
                </span>
                <span className="font-black text-gold tnum">{r.points.toLocaleString()}</span>
              </li>
            ))}
            {board.length === 0 && <li className="py-10 text-center text-2xl text-muted">Be the first on the board.</li>}
          </ol>
          {winners.length > 0 && (
            <div className="mt-6 border-t border-edge pt-4 text-xl text-muted">
              🏆 Last winner: <span className="font-bold text-white">{winners[0].handle}</span> — {winners[0].prize}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
