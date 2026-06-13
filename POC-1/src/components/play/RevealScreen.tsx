"use client";
import type { DropPayload, RevealPayload } from "@/lib/types";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

export type MyResult = {
  answered: boolean;
  isCorrect: boolean | null;
  points: number;
  won: boolean;
  code: string | null;
  prizeName: string | null;
  expiresAt: string | null;
};

export function RevealScreen({
  drop,
  reveal,
  result,
  meHandle,
  onContinue,
}: {
  drop: DropPayload;
  reveal: RevealPayload;
  result: MyResult | null;
  meHandle: string | null;
  onContinue: () => void;
}) {
  const won = result?.won;
  const correct = result?.isCorrect === true;
  const isWinnerMe = won || (reveal.winner && reveal.winner.handle === meHandle);
  const maxTally = Math.max(1, ...(reveal.tally ?? [1]));

  return (
    <div className="flex min-h-[100dvh] flex-col px-5 py-8 animate-drop-in">
      {/* Headline result */}
      <div className="text-center">
        {result?.answered ? (
          correct ? (
            <>
              <div className="text-5xl animate-pop">✅</div>
              <h2 className="mt-2 text-3xl font-black text-good">Correct!</h2>
            </>
          ) : reveal.format === "poll" ? (
            <>
              <div className="text-5xl animate-pop">🗳️</div>
              <h2 className="mt-2 text-3xl font-black">Thanks for voting</h2>
            </>
          ) : (
            <>
              <div className="text-5xl animate-pop">❌</div>
              <h2 className="mt-2 text-3xl font-black text-bad">Not this time</h2>
            </>
          )
        ) : (
          <>
            <div className="text-5xl">⏱️</div>
            <h2 className="mt-2 text-2xl font-black text-muted">Drop closed</h2>
          </>
        )}
        {result && result.points > 0 && (
          <p className="mt-1 text-lg font-bold text-gold animate-pop">+{result.points} points</p>
        )}
      </div>

      {/* Prize win — the emotional peak */}
      {isWinnerMe && result?.code && (
        <div className="mt-6 rounded-2xl border border-gold bg-gradient-to-b from-gold/20 to-transparent p-5 text-center">
          <div className="text-3xl">🏆</div>
          <div className="mt-1 text-lg font-bold text-gold">You won {result.prizeName}!</div>
          <p className="text-sm text-muted">Show this code at the counter:</p>
          <div className="mt-3 rounded-xl border border-gold/50 bg-ink px-4 py-3 text-3xl font-black tracking-[0.3em] tnum text-gold">
            {result.code}
          </div>
          {result.expiresAt && (
            <p className="mt-2 text-xs text-muted">
              Expires {new Date(result.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
        </div>
      )}

      {/* Winner spotlight (when it's not you) */}
      {!isWinnerMe && reveal.isPrizeDrop && reveal.winner && (
        <div className="mt-6 rounded-2xl border border-edge bg-panel2/60 p-4 text-center">
          <div className="text-2xl">🏆</div>
          <div className="mt-1 font-bold">
            {reveal.winner.handle} won — {(reveal.winner.elapsedMs / 1000).toFixed(2)}s
          </div>
          <p className="text-xs text-muted">Fastest correct answer in the room</p>
        </div>
      )}

      {/* The answer + tally */}
      <div className="mt-6">
        {reveal.format === "closest_guess" ? (
          <div className="rounded-2xl border border-edge bg-panel2/60 p-4 text-center">
            <div className="label">Answer</div>
            <div className="mt-1 text-3xl font-black text-good tnum">
              {reveal.correctNumber}
              {reveal.unit ? ` ${reveal.unit}` : ""}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {(drop.options ?? []).map((opt, i) => {
              const isAnswer = reveal.correctOption === i;
              const count = reveal.tally?.[i] ?? 0;
              const pct = Math.round((count / maxTally) * 100);
              return (
                <div
                  key={i}
                  className={`relative overflow-hidden rounded-xl border px-3 py-3 ${
                    isAnswer ? "border-good bg-good/10" : "border-edge bg-panel2/40"
                  }`}
                >
                  <div
                    className={`absolute inset-y-0 left-0 ${isAnswer ? "bg-good/15" : "bg-white/5"}`}
                    style={{ width: `${pct}%`, transition: "width 0.6s ease-out" }}
                  />
                  <div className="relative flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="text-xs text-muted">{OPTION_LABELS[i]}</span>
                      {opt}
                      {isAnswer && reveal.format !== "poll" && <span className="text-good">✓</span>}
                    </span>
                    <span className="tnum text-sm text-muted">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-muted">{reveal.answerCount} answered this drop</p>

      <div className="mt-auto pt-6">
        <button className="btn-ghost w-full" onClick={onContinue}>
          Back to leaderboard
        </button>
      </div>
    </div>
  );
}
