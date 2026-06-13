/**
 * Local migration verifier.
 *
 * We cannot run Supabase in this environment (no Docker), so this applies the real
 * supabase/migrations against a plain local Postgres after stubbing the Supabase-provided
 * pieces (the `auth` schema, `auth.uid()`, the anon/authenticated/service_role roles, and an
 * `extensions` schema). It catches SQL/DDL errors so `supabase db push` against the real project
 * is a non-event. It also runs a couple of RLS smoke checks.
 *
 * Usage: DATABASE_URL=postgres://drop@127.0.0.1:5432/thedrop tsx scripts/verify-local.ts
 */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DATABASE_URL = process.env.DATABASE_URL || "postgres://drop@127.0.0.1:5432/thedrop";
const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

const STUB = `
  create schema if not exists extensions;
  create extension if not exists pgcrypto with schema extensions;
  set search_path = public, extensions, auth;
  drop schema if exists public cascade;
  create schema public;
  drop schema if exists auth cascade;
  create schema auth;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    phone text,
    created_at timestamptz not null default now()
  );
  -- Supabase's auth.uid(): the authenticated user's id from the request JWT.
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  do $$ begin create role anon;          exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated;  exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;   exception when duplicate_object then null; end $$;
  grant usage on schema extensions to anon, authenticated, service_role;
`;

async function main() {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  console.log("→ resetting schema + Supabase stubs");
  await c.query("set search_path = public, extensions, auth");
  await c.query(STUB);
  await c.query("set search_path = public, extensions, auth");

  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    process.stdout.write(`→ applying ${f} ... `);
    try {
      await c.query(sql);
      console.log("ok");
    } catch (e: any) {
      console.log("FAILED");
      console.error(`\n${f}: ${e.message}\n`);
      process.exit(1);
    }
  }

  // Smoke checks
  const tables = await c.query(
    "select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
  );
  const rls = await c.query(
    "select count(*)::int n from pg_tables where schemaname='public' and rowsecurity=true"
  );
  const policies = await c.query("select count(*)::int n from pg_policies where schemaname='public'");
  const funcs = await c.query(
    "select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'"
  );

  console.log("\n✓ migrations applied cleanly");
  console.log(`  tables: ${tables.rows[0].n}`);
  console.log(`  RLS-enabled tables: ${rls.rows[0].n}`);
  console.log(`  policies: ${policies.rows[0].n}`);
  console.log(`  functions: ${funcs.rows[0].n}`);

  // Verify the load-bearing rule: questions is RLS-enabled (no client policy = service-role only).
  const qRls = await c.query(
    "select rowsecurity from pg_tables where schemaname='public' and tablename='questions'"
  );
  const qPol = await c.query("select count(*)::int n from pg_policies where schemaname='public' and tablename='questions'");
  if (!qRls.rows[0]?.rowsecurity || qPol.rows[0].n !== 0) {
    throw new Error("SECURITY: questions must have RLS on and zero client policies");
  }
  console.log("  ✓ questions table is service-role-only (answer key isolated)");

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
