"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Tier-2 claim (spec §7), triggered at the emotional peak. Phone + one-time code (no password),
// using Supabase Auth to upgrade the *same* anonymous user so points persist. Marketing consent is
// captured separately from the phone (which exists for prize delivery + persistence). A Google
// fallback is offered for venues without SMS configured.
export function ClaimSheet({
  reason,
  onClose,
  onClaimed,
}: {
  reason: string;
  onClose: () => void;
  onClaimed: () => void;
}) {
  const sb = supabaseBrowser();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    setErr(null);
    const { error } = await sb.auth.updateUser({ phone });
    setBusy(false);
    if (error) return setErr(error.message + " (the venue may need SMS configured — try Google below)");
    setStep("code");
  }

  async function verify() {
    setBusy(true);
    setErr(null);
    const { error } = await sb.auth.verifyOtp({ phone, token: code, type: "phone_change" });
    if (error) {
      setBusy(false);
      return setErr(error.message);
    }
    await fetch("/api/play/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketingOptIn: optIn }),
    });
    setBusy(false);
    onClaimed();
  }

  async function withGoogle() {
    setErr(null);
    const { error } = await sb.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (error) setErr(error.message + " (enable Google in Supabase Auth providers)");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="card w-full max-w-md rounded-b-none p-6 sm:rounded-2xl animate-drop-in">
        <div className="mb-1 text-2xl">📱</div>
        <h3 className="text-xl font-bold">Save your spot</h3>
        <p className="mt-1 text-sm text-muted">{reason}</p>

        {step === "phone" ? (
          <div className="mt-4 space-y-3">
            <input
              className="input tnum"
              inputMode="tel"
              placeholder="+1 555 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <label className="flex items-start gap-2 text-xs text-muted">
              <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-0.5" />
              <span>Text me when I&apos;m about to lose my leaderboard spot (optional, separate from prizes).</span>
            </label>
            {err && <p className="text-sm text-bad">{err}</p>}
            <button className="btn-primary w-full" disabled={busy || phone.length < 7} onClick={sendCode}>
              {busy ? "Sending…" : "Send code"}
            </button>
            <button className="btn-ghost w-full" onClick={withGoogle}>
              Continue with Google
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input
              className="input tnum text-center text-2xl tracking-[0.4em]"
              inputMode="numeric"
              placeholder="••••••"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {err && <p className="text-sm text-bad">{err}</p>}
            <button className="btn-primary w-full" disabled={busy || code.length < 4} onClick={verify}>
              {busy ? "Verifying…" : "Verify & save"}
            </button>
            <button className="btn-ghost w-full" onClick={() => setStep("phone")}>
              Back
            </button>
          </div>
        )}

        <button className="mt-4 w-full text-center text-sm text-muted" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
