"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { venueChannel, RT_EVENT } from "@/lib/realtime/channel";
import type { DropPayload, RevealPayload } from "@/lib/types";
import { RestingScreen, type RestingData } from "./RestingScreen";
import { DropScreen } from "./DropScreen";
import { RevealScreen, type MyResult } from "./RevealScreen";
import { ClaimSheet } from "./ClaimSheet";
import { registerAndSubscribePush } from "@/lib/push";

type Phase = "loading" | "resting" | "live" | "reveal";
type StateResponse = RestingData & {
  liveDrop: DropPayload | null;
  me: { handle: string | null; claimed: boolean };
};

export function VenueClient({
  venue,
}: {
  venue: { id: string; slug: string; name: string; tagline: string | null };
}) {
  const sb = supabaseBrowser();
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<StateResponse | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  const [drop, setDrop] = useState<DropPayload | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [result, setResult] = useState<MyResult | null>(null);
  const [locked, setLocked] = useState(false);
  const [myChoice, setMyChoice] = useState<number | null>(null);
  const [lockedCount, setLockedCount] = useState(0);
  const [presence, setPresence] = useState(1);
  const [timer, setTimer] = useState({ fraction: 1, secondsLeft: 0 });

  const [claim, setClaim] = useState<string | null>(null); // reason text or null
  const [canInstall, setCanInstall] = useState(false);

  const renderPerf = useRef(0);
  const deadline = useRef(0);
  const displayMs = useRef(1);
  const revealTriggered = useRef(false);
  const installPrompt = useRef<any>(null);
  const dropRef = useRef<DropPayload | null>(null);
  dropRef.current = drop;

  const refreshState = useCallback(async () => {
    const res = await fetch(`/api/v/${venue.slug}/state`, { cache: "no-store" });
    if (!res.ok) return;
    const data: StateResponse = await res.json();
    setState(data);
    setHandle(data.me.handle);
    setClaimed(data.me.claimed);
    return data;
  }, [venue.slug]);

  const onDrop = useCallback((payload: DropPayload) => {
    const now = Date.now();
    const windowMs = payload.countdownSeconds * 1000;
    const remaining = new Date(payload.closesAt).getTime() - now;
    const display = Math.min(windowMs, remaining);
    if (display <= 300) return; // effectively over; ignore (will catch the reveal)
    renderPerf.current = performance.now();
    deadline.current = now + display;
    displayMs.current = display;
    revealTriggered.current = false;
    setDrop(payload);
    setReveal(null);
    setResult(null);
    setLocked(false);
    setMyChoice(null);
    setLockedCount(0);
    setTimer({ fraction: 1, secondsLeft: display / 1000 });
    setPhase("live");
  }, []);

  const triggerReveal = useCallback(async (dropId: string) => {
    try {
      const res = await fetch(`/api/drops/${dropId}/reveal`, { method: "POST" });
      if (res.ok) {
        const { reveal: rv } = await res.json();
        if (rv) onReveal(rv);
      }
    } catch {
      /* the cron reconciler / another client will reveal it */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onReveal = useCallback(
    (payload: RevealPayload) => {
      setReveal((prev) => {
        if (prev && prev.dropId === payload.dropId) return prev; // dedupe
        // fetch this player's personal result + refresh boards
        fetch(`/api/play/result?dropId=${payload.dropId}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((res) => res && setResult(res))
          .catch(() => {});
        refreshState();
        return payload;
      });
      setPhase("reveal");
    },
    [refreshState]
  );

  const submitAnswer = useCallback(
    async (choice: { selectedOption?: number; answerNumber?: number }) => {
      const d = dropRef.current;
      if (!d || locked) return;
      setLocked(true);
      if (choice.selectedOption != null) setMyChoice(choice.selectedOption);
      const elapsedMs = Math.round(performance.now() - renderPerf.current);
      try {
        await fetch("/api/play/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dropId: d.dropId, ...choice, elapsedMs }),
        });
      } catch {
        /* network — answer may not have counted; the reveal will show the truth */
      }
    },
    [locked]
  );

  // --- boot: session → join → state → realtime ---
  useEffect(() => {
    let channel: ReturnType<typeof sb.channel> | null = null;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) await sb.auth.signInAnonymously();

      await fetch("/api/play/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: venue.id }),
      }).catch(() => {});

      const st = await refreshState();
      setPhase("resting");
      if (st?.liveDrop) onDrop(st.liveDrop);

      const { data: u } = await sb.auth.getUser();
      const myId = u.user?.id ?? Math.random().toString(36);

      channel = sb.channel(venueChannel(venue.id), {
        config: { presence: { key: myId } },
      });
      channel
        .on("broadcast", { event: RT_EVENT.drop }, ({ payload }) => onDrop(payload as DropPayload))
        .on("broadcast", { event: RT_EVENT.reveal }, ({ payload }) => onReveal(payload as RevealPayload))
        .on("broadcast", { event: RT_EVENT.answered }, ({ payload }) => {
          if (dropRef.current && (payload as any)?.dropId === dropRef.current.dropId) {
            setLockedCount((c) => c + 1);
          }
        })
        .on("presence", { event: "sync" }, () => {
          const stateObj = channel!.presenceState();
          setPresence(Object.keys(stateObj).length || 1);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") await channel!.track({ at: Date.now() });
        });
    })();

    return () => {
      if (channel) sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue.id]);

  // --- per-device countdown loop ---
  useEffect(() => {
    if (phase !== "live") return;
    let raf = 0;
    const loop = () => {
      const rem = deadline.current - Date.now();
      setTimer({ fraction: rem / displayMs.current, secondsLeft: rem / 1000 });
      if (rem <= 0 && !revealTriggered.current && dropRef.current) {
        revealTriggered.current = true;
        triggerReveal(dropRef.current.dropId);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, triggerReveal]);

  // --- PWA install availability ---
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onBip = (e: Event) => {
      e.preventDefault();
      installPrompt.current = e;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    // iOS: no beforeinstallprompt — offer the manual path if not already installed.
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
    if (!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) setCanInstall(true);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  // --- show claim prompt at the emotional peak (a win or top-3 placement) ---
  useEffect(() => {
    if (phase !== "reveal" || claimed || !result) return;
    const rank = state?.leaderboards.tonight.findIndex((r) => r.handle === handle) ?? -1;
    if (result.won) setClaim("Lock in your prize and keep your points across visits.");
    else if (rank >= 0 && rank < 3) setClaim("You're on the board! Save your spot before someone takes it.");
  }, [phase, result, claimed, state, handle]);

  async function editHandle() {
    const next = window.prompt("Pick a handle", handle ?? "");
    if (!next) return;
    const res = await fetch("/api/play/handle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: next }),
    });
    if (res.ok) {
      const { handle: h } = await res.json();
      setHandle(h);
      refreshState();
    }
  }

  async function doInstall() {
    if (installPrompt.current) {
      installPrompt.current.prompt();
      installPrompt.current = null;
      setCanInstall(false);
    } else {
      alert("On iPhone: tap the Share button, then “Add to Home Screen”. Then reopen from your home screen to enable buzz-in alerts.");
    }
    await registerAndSubscribePush().catch(() => {});
  }

  if (phase === "loading" || !state) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <div className="animate-pulse text-muted">Joining {venue.name}…</div>
      </div>
    );
  }

  return (
    <>
      {phase === "resting" && (
        <RestingScreen
          data={state}
          handle={handle}
          claimed={claimed}
          presence={presence}
          canInstall={canInstall}
          onEditHandle={editHandle}
          onInstall={doInstall}
          onClaim={() => setClaim("Save your handle and points so the weekly board carries across visits.")}
        />
      )}
      {phase === "live" && drop && (
        <DropScreen
          drop={drop}
          fraction={timer.fraction}
          secondsLeft={timer.secondsLeft}
          locked={locked}
          myChoice={myChoice}
          lockedCount={lockedCount}
          onAnswer={submitAnswer}
        />
      )}
      {phase === "reveal" && drop && reveal && (
        <RevealScreen
          drop={drop}
          reveal={reveal}
          result={result}
          meHandle={handle}
          onContinue={() => {
            setPhase("resting");
            refreshState();
          }}
        />
      )}

      {claim && (
        <ClaimSheet
          reason={claim}
          onClose={() => setClaim(null)}
          onClaimed={() => {
            setClaim(null);
            setClaimed(true);
            refreshState();
          }}
        />
      )}
    </>
  );
}
