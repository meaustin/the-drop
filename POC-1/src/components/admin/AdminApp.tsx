"use client";
import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import { supabaseBrowser } from "@/lib/supabase/browser";

type VenueRef = { id: string; slug: string; name: string; tagline: string | null; status: string; role: string };

async function post(venueId: string, body: any) {
  const res = await fetch(`/api/admin/venue/${venueId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export function AdminApp() {
  const sb = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [venues, setVenues] = useState<VenueRef[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const loadVenues = useCallback(async () => {
    const res = await fetch("/api/admin/venues", { cache: "no-store" });
    if (res.status === 401) {
      setVenues(null);
      setLoading(false);
      return;
    }
    const { venues } = await res.json();
    setVenues(venues);
    if (venues.length === 1) setSelected(venues[0].id);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  if (loading) return <Center>Loading admin…</Center>;
  if (!venues) return <Login onDone={() => { setLoading(true); loadVenues(); }} />;

  if (venues.length === 0)
    return (
      <Center>
        <div className="text-center">
          <p>You’re signed in, but not a member of any venue.</p>
          <p className="mt-2 text-sm">Run <code className="text-white">npm run db:seed</code> to create the pilot venues, then sign in as the seeded owner.</p>
          <button className="btn-ghost mt-4" onClick={() => sb.auth.signOut().then(() => { setLoading(true); loadVenues(); })}>Sign out</button>
        </div>
      </Center>
    );

  if (!selected)
    return (
      <main className="mx-auto max-w-lg px-5 py-8">
        <H1>Your venues</H1>
        <div className="mt-4 space-y-2">
          {venues.map((v) => (
            <button key={v.id} onClick={() => setSelected(v.id)} className="card flex w-full items-center justify-between p-4 text-left">
              <div>
                <div className="font-bold">{v.name}</div>
                <div className="text-sm text-muted">{v.tagline}</div>
              </div>
              <span className="pill">{v.role} · {v.status}</span>
            </button>
          ))}
        </div>
        <SignOut sb={sb} reload={() => { setLoading(true); loadVenues(); }} />
      </main>
    );

  return <Dashboard venueId={selected} onBack={() => setSelected(null)} sb={sb} />;
}

// ---------------------------------------------------------------------------
function Dashboard({ venueId, onBack, sb }: { venueId: string; onBack: () => void; sb: any }) {
  const [d, setD] = useState<any>(null);
  const [qr, setQr] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/venue/${venueId}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setD(data);
    QRCode.toDataURL(data.links.joinUrl, { margin: 1, width: 200 }).then(setQr);
  }, [venueId]);

  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };
  const act = async (body: any, okMsg?: string) => {
    const { ok, data } = await post(venueId, body);
    flash(ok ? (okMsg ?? "Done") : `Error: ${data.error ?? "failed"}`);
    await load();
    return { ok, data };
  };

  if (!d) return <Center>Loading venue…</Center>;
  const s = d.settings ?? {};

  return (
    <main className="mx-auto max-w-2xl px-5 py-6">
      <button onClick={onBack} className="text-sm text-muted">← venues</button>
      <div className="mt-1 flex items-center justify-between">
        <H1>{d.venue.name}</H1>
        <StatusPill status={d.venue.status} onChange={(status) => act({ action: "status", status }, `Now ${status}`)} />
      </div>

      {/* Live controls */}
      <Section title="Live controls">
        <p className="mb-3 text-sm text-muted">Fire a drop on cue — for the launch-night seed drop or a pitch demo.</p>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={() => act({ action: "fire" }, "Drop fired ⚡")}>Fire a points drop</button>
          <button className="btn-ghost flex-1 border-gold/50 text-gold" onClick={() => act({ action: "fire", prize: true }, "Prize drop fired 🎁")}>Fire a prize drop</button>
        </div>
        {d.venue.status !== "active" && <p className="mt-2 text-xs text-gold">Tip: set status to “active” so the scheduler also fires drops automatically.</p>}
      </Section>

      {/* Links & QR */}
      <Section title="Scan-to-play & house screen">
        <div className="flex items-center gap-4">
          {qr && <img src={qr} alt="join QR" className="h-32 w-32 rounded-xl bg-white p-1.5" />}
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <LinkRow label="Play URL (table tent)" url={d.links.joinUrl} />
            <LinkRow label="House screen (TV)" url={d.links.screenUrl} />
          </div>
        </div>
      </Section>

      {/* Redemption confirm */}
      <RedemptionPanel openRedemptions={d.openRedemptions} onConfirm={(code) => act({ action: "redeem", code })} />

      {/* Prizes */}
      <PrizePanel prizes={d.prizes} act={act} />

      {/* Settings */}
      <SettingsPanel s={s} act={act} />

      {/* Active windows */}
      <WindowsPanel windows={d.windows} act={act} />

      {/* Packs */}
      <Section title="Content packs">
        <div className="grid grid-cols-2 gap-2">
          {d.packs.map((p: any) => (
            <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${p.enabled ? "border-accent bg-accent/10" : "border-edge bg-panel2"}`}>
              <input type="checkbox" checked={p.enabled} onChange={(e) => act({ action: "pack_toggle", pack_id: p.id, enabled: e.target.checked })} />
              <span>{p.emoji} {p.name}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* Review queue */}
      <ReviewPanel venueId={venueId} pendingCount={d.pendingReview} act={act} />

      <SignOut sb={sb} reload={onBack} />
      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-panel2 px-4 py-2 text-sm shadow-lg">{toast}</div>}
    </main>
  );
}

// ---------- panels ----------
function RedemptionPanel({ openRedemptions, onConfirm }: { openRedemptions: any[]; onConfirm: (code: string) => Promise<any> }) {
  const [code, setCode] = useState("");
  return (
    <Section title="Confirm a winner">
      <div className="flex gap-2">
        <input className="input tnum uppercase" placeholder="WIN CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="btn-primary" onClick={async () => { await onConfirm(code); setCode(""); }}>Confirm</button>
      </div>
      {openRedemptions.length > 0 && (
        <div className="mt-3 space-y-1 text-sm">
          <div className="label">Outstanding</div>
          {openRedemptions.map((r) => (
            <div key={r.id} className="flex justify-between rounded-lg bg-panel2/50 px-3 py-1.5">
              <span className="tnum font-bold">{r.code}</span>
              <span className="text-muted">expires {new Date(r.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function PrizePanel({ prizes, act }: { prizes: any[]; act: (b: any, m?: string) => Promise<any> }) {
  const [name, setName] = useState("");
  return (
    <Section title="Prizes">
      <div className="space-y-1.5">
        {prizes.filter((p) => p.is_active).map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg bg-panel2/50 px-3 py-2 text-sm">
            <span>🎁 {p.name}</span>
            <button className="text-bad" onClick={() => act({ action: "prize_delete", id: p.id }, "Removed")}>remove</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input className="input" placeholder="Free draft beer" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-ghost" onClick={async () => { if (name.trim()) { await act({ action: "prize_upsert", name: name.trim() }, "Added"); setName(""); } }}>Add</button>
      </div>
    </Section>
  );
}

function SettingsPanel({ s, act }: { s: any; act: (b: any, m?: string) => Promise<any> }) {
  const [f, setF] = useState(s);
  useEffect(() => setF(s), [s]);
  const fields: [string, string][] = [
    ["countdown_seconds", "Countdown (s)"],
    ["drops_per_hour", "Drops / hour"],
    ["base_points", "Base points"],
    ["max_speed_bonus", "Max speed bonus"],
    ["prize_drops_per_day", "Prize drops / day"],
    ["daily_prize_cap", "Daily prize cap"],
    ["prize_cooldown_minutes", "Prize cooldown (min)"],
    ["redemption_ttl_minutes", "Redemption TTL (min)"],
  ];
  return (
    <Section title="Game settings">
      <div className="grid grid-cols-2 gap-3">
        {fields.map(([k, label]) => (
          <label key={k} className="text-sm">
            <span className="label">{label}</span>
            <input className="input mt-1 tnum" type="number" value={f?.[k] ?? ""} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      <button className="btn-primary mt-3 w-full" onClick={() => act({ action: "settings", ...Object.fromEntries(fields.map(([k]) => [k, Number(f[k])])) }, "Settings saved")}>Save settings</button>
    </Section>
  );
}

function WindowsPanel({ windows, act }: { windows: any[]; act: (b: any, m?: string) => Promise<any> }) {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const [rows, setRows] = useState<any[]>(windows.map((w) => ({ ...w })));
  useEffect(() => setRows(windows.map((w) => ({ ...w }))), [windows]);
  return (
    <Section title="Active windows">
      <p className="mb-2 text-xs text-muted">When drops are allowed to fire (venue-local time).</p>
      <div className="space-y-2">
        {rows.map((w, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <select className="input" value={w.day_of_week} onChange={(e) => { const r = [...rows]; r[i].day_of_week = Number(e.target.value); setRows(r); }}>
              {DAYS.map((d, di) => <option key={di} value={di}>{d}</option>)}
            </select>
            <input className="input tnum" type="time" value={w.starts_at?.slice(0, 5)} onChange={(e) => { const r = [...rows]; r[i].starts_at = e.target.value; setRows(r); }} />
            <input className="input tnum" type="time" value={w.ends_at?.slice(0, 5)} onChange={(e) => { const r = [...rows]; r[i].ends_at = e.target.value; setRows(r); }} />
            <button className="text-bad" onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button className="btn-ghost flex-1" onClick={() => setRows([...rows, { day_of_week: 5, starts_at: "16:00", ends_at: "23:00" }])}>+ window</button>
        <button className="btn-primary flex-1" onClick={() => act({ action: "windows", windows: rows.map((w) => ({ ...w, starts_at: w.starts_at.slice(0, 5), ends_at: w.ends_at.slice(0, 5) })) }, "Windows saved")}>Save</button>
      </div>
    </Section>
  );
}

function ReviewPanel({ venueId, pendingCount, act }: { venueId: string; pendingCount: number; act: (b: any, m?: string) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  const [qs, setQs] = useState<any[]>([]);
  const load = async () => {
    const res = await fetch(`/api/admin/venue/${venueId}/questions`, { cache: "no-store" });
    if (res.ok) setQs((await res.json()).questions);
  };
  return (
    <Section title={`Content review (${pendingCount} pending)`}>
      {!open ? (
        <button className="btn-ghost w-full" onClick={() => { setOpen(true); load(); }}>Open review queue</button>
      ) : (
        <div className="space-y-3">
          {qs.length === 0 && <p className="text-sm text-muted">Nothing pending. ✅</p>}
          {qs.map((q) => (
            <div key={q.id} className="rounded-xl border border-edge bg-panel2/50 p-3 text-sm">
              <div className="flex justify-between text-xs text-muted">
                <span>{q.format} · {q.category ?? "—"} · {q.source}</span>
                {q.ambiguity_score != null && <span className={q.ambiguity_score > 0.4 ? "text-bad" : "text-muted"}>risk {Number(q.ambiguity_score).toFixed(2)}</span>}
              </div>
              <div className="mt-1 font-semibold">{q.prompt}</div>
              {q.options && (
                <ul className="mt-1 text-muted">
                  {(q.options as string[]).map((o, i) => (
                    <li key={i} className={i === q.correct_option ? "text-good" : ""}>{i === q.correct_option ? "✓ " : "· "}{o}</li>
                  ))}
                </ul>
              )}
              {q.correct_number != null && <div className="mt-1 text-good">answer: {q.correct_number}{q.unit ? ` ${q.unit}` : ""}</div>}
              <div className="mt-2 flex gap-2">
                <button className="btn-primary flex-1 py-1.5 text-sm" onClick={async () => { await act({ action: "approve_question", questionId: q.id }); load(); }}>Approve</button>
                <button className="btn-ghost flex-1 py-1.5 text-sm" onClick={async () => { await act({ action: "reject_question", questionId: q.id }); load(); }}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ---------- small UI bits ----------
function Login({ onDone }: { onDone: () => void }) {
  const sb = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setErr(null);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
  }
  return (
    <Center>
      <div className="card w-full max-w-sm p-6">
        <H1>Venue admin</H1>
        <p className="mt-1 text-sm text-muted">Sign in to manage your venue.</p>
        <div className="mt-4 space-y-3">
          <input className="input" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {err && <p className="text-sm text-bad">{err}</p>}
          <button className="btn-primary w-full" disabled={busy} onClick={go}>{busy ? "…" : "Sign in"}</button>
        </div>
        <p className="mt-3 text-xs text-muted">Seeded owner: <code className="text-white">owner@thedrop.test</code> / <code className="text-white">dropdemo123</code></p>
      </div>
    </Center>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex items-center gap-2">
        <input className="input flex-1 text-xs" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button className="btn-ghost px-3 py-2 text-xs" onClick={() => navigator.clipboard?.writeText(url)}>copy</button>
      </div>
    </div>
  );
}

function StatusPill({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  return (
    <select value={status} onChange={(e) => onChange(e.target.value)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${status === "active" ? "border-good text-good" : status === "paused" ? "border-gold text-gold" : "border-edge text-muted"}`}>
      <option value="setup">setup</option>
      <option value="active">active</option>
      <option value="paused">paused</option>
    </select>
  );
}

function SignOut({ sb, reload }: { sb: any; reload: () => void }) {
  return <button className="mt-8 w-full text-center text-sm text-muted" onClick={() => sb.auth.signOut().then(reload)}>Sign out</button>;
}

const H1 = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-black">{children}</h1>;
const Center = ({ children }: { children: React.ReactNode }) => <main className="grid min-h-[100dvh] place-items-center px-5 text-muted">{children}</main>;
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mt-4 p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}
