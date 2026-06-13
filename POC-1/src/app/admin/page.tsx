import { isSupabaseConfigured } from "@/lib/env";
import { AdminApp } from "@/components/admin/AdminApp";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="grid min-h-[100dvh] place-items-center px-6 text-center text-muted">
        Supabase isn’t configured yet. See README.md.
      </main>
    );
  }
  return <AdminApp />;
}
