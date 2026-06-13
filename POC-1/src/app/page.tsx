import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

async function getVenues() {
  if (!isSupabaseConfigured()) return null;
  try {
    const { admin } = await import("@/lib/supabase/admin");
    const { data } = await admin()
      .from("venues")
      .select("slug, name, tagline, status")
      .order("created_at", { ascending: true });
    return data ?? [];
  } catch {
    return null;
  }
}

export default async function Home() {
  const venues = await getVenues();
  const configured = isSupabaseConfigured();

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-4 h-16 w-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="The Drop" className="h-16 w-16" />
        </div>
        <h1 className="text-4xl font-black tracking-tight">The Drop</h1>
        <p className="mt-2 text-muted">
          An always-on trivia game for your favorite venues. A question{" "}
          <span className="text-drop">drops</span> — be fastest, win a treat.
        </p>
      </header>

      {!configured && (
        <section className="card mb-6 p-5">
          <h2 className="mb-2 text-lg font-bold">⚙️ Finish setup</h2>
          <p className="mb-3 text-sm text-muted">
            Add your Supabase project keys to <code className="text-white">.env.local</code>, push the
            schema, and seed the pilot venues. Full steps are in <code className="text-white">README.md</code>.
          </p>
          <ol className="space-y-1.5 text-sm text-muted">
            <li>1. Copy <code className="text-white">.env.example</code> → <code className="text-white">.env.local</code>, fill Supabase keys.</li>
            <li>2. <code className="text-white">supabase link</code> &amp; <code className="text-white">npm run db:push</code></li>
            <li>3. <code className="text-white">npm run db:seed</code> (pilot venues + vetted question library)</li>
            <li>4. <code className="text-white">npm run dev</code></li>
          </ol>
        </section>
      )}

      {configured && venues && venues.length > 0 && (
        <section className="mb-6 space-y-3">
          <h2 className="label px-1">Venues</h2>
          {venues.map((v: any) => (
            <div key={v.slug} className="card flex items-center justify-between p-4">
              <div>
                <div className="font-bold">{v.name}</div>
                <div className="text-sm text-muted">{v.tagline}</div>
                <span className="pill mt-2">{v.status}</span>
              </div>
              <div className="flex flex-col gap-2">
                <Link href={`/v/${v.slug}`} className="btn-primary text-sm">Play</Link>
                <Link href={`/v/${v.slug}/screen`} className="btn-ghost text-sm">House screen</Link>
              </div>
            </div>
          ))}
        </section>
      )}

      {configured && venues && venues.length === 0 && (
        <section className="card mb-6 p-5 text-sm text-muted">
          No venues yet. Run <code className="text-white">npm run db:seed</code> to create the pilot venues,
          or <Link href="/admin" className="text-accent">open the admin</Link> to claim one.
        </section>
      )}

      <div className="flex justify-center gap-3">
        <Link href="/admin" className="btn-ghost text-sm">Venue admin →</Link>
      </div>

      <footer className="mt-10 text-center text-xs text-muted">
        The Drop · Phase 1 MVP
      </footer>
    </main>
  );
}
