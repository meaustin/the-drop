"use client";
import { useState } from "react";
import type { DropPayload } from "@/lib/types";
import { Countdown } from "./Countdown";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

export function DropScreen({
  drop,
  fraction,
  secondsLeft,
  locked,
  myChoice,
  lockedCount,
  onAnswer,
}: {
  drop: DropPayload;
  fraction: number;
  secondsLeft: number;
  locked: boolean;
  myChoice: number | null;
  lockedCount: number;
  onAnswer: (choice: { selectedOption?: number; answerNumber?: number }) => void;
}) {
  const [guess, setGuess] = useState("");

  return (
    <div className="flex min-h-[100dvh] flex-col px-5 py-6 animate-drop-in">
      <div className="flex items-center justify-between">
        <span className="pill">
          {drop.isPrizeDrop ? "🎁 Prize drop" : "⚡ Points drop"}
          {drop.category ? ` · ${drop.category}` : ""}
        </span>
        <span className="pill tnum">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-drop" />
          {lockedCount} locked in
        </span>
      </div>

      {drop.isPrizeDrop && drop.prize && (
        <div className="mt-3 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-center text-sm">
          <span className="font-semibold text-gold">Fastest correct wins:</span> {drop.prize.name}
        </div>
      )}

      <div className="my-6 flex justify-center">
        <Countdown fraction={fraction} secondsLeft={secondsLeft} />
      </div>

      <h2 className="text-balance text-center text-2xl font-bold leading-snug">{drop.prompt}</h2>

      <div className="mt-6 flex-1">
        {drop.format === "closest_guess" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                className="input tnum text-center text-2xl"
                inputMode="decimal"
                placeholder="Your best guess"
                value={guess}
                disabled={locked}
                onChange={(e) => setGuess(e.target.value.replace(/[^0-9.\-]/g, ""))}
              />
              {drop.unit && <span className="text-muted">{drop.unit}</span>}
            </div>
            <button
              className="btn-primary w-full"
              disabled={locked || guess.length === 0}
              onClick={() => onAnswer({ answerNumber: Number(guess) })}
            >
              {locked ? "Locked in ✓" : "Lock in guess"}
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {(drop.options ?? []).map((opt, i) => {
              const selected = myChoice === i;
              return (
                <button
                  key={i}
                  disabled={locked}
                  onClick={() => onAnswer({ selectedOption: i })}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-4 text-left text-lg font-semibold transition active:scale-[0.99] ${
                    selected
                      ? "border-accent bg-accent/20"
                      : locked
                      ? "border-edge bg-panel2/40 opacity-60"
                      : "border-edge bg-panel2 hover:border-accent"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${
                      selected ? "bg-accent text-white" : "bg-ink text-muted"
                    }`}
                  >
                    {OPTION_LABELS[i]}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {locked && (
        <p className="mt-4 text-center text-sm text-muted">
          {drop.format === "poll" ? "Vote in." : "Answer locked."} Hang tight for the reveal…
        </p>
      )}
    </div>
  );
}
