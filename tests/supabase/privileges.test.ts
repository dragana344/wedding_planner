import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
});

afterAll(async () => {
  await db.end();
});

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
});

describe("anon privileges (SEC-023)", () => {
  it("holds no privileges on any public table or sequence", async () => {
    const { rows } = await db.query(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public'`,
    );
    expect(rows).toEqual([]);
    const { rows: seq } = await db.query(
      `select c.relname from pg_class c
       where c.relnamespace = 'public'::regnamespace
         and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'USAGE') else false end`,
    );
    expect(seq).toEqual([]);
  });

  it("is refused by the API when reading tables", async () => {
    for (const table of ["venues", "events", "event_guests", "couple_sessions", "contact_submissions"]) {
      const { error } = await anon.from(table).select("*").limit(1);
      expect(error?.code, table).toBe("42501");
    }
  });

  it("does not grant new tables to API roles by default", async () => {
    await db.query("create table public.sec023_probe (id int)");
    try {
      const { rows } = await db.query(
        `select grantee from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'sec023_probe' and grantee in ('anon', 'authenticated')`,
      );
      expect(rows).toEqual([]);
    } finally {
      await db.query("drop table public.sec023_probe");
    }
  });
});

describe("SECURITY DEFINER functions (SEC-006)", () => {
  it("pin an explicit search_path", async () => {
    const { rows } = await db.query(
      `select p.proname from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(rows).toEqual([]);
  });

  it("are not executable by anon or PUBLIC", async () => {
    const { rows } = await db.query(
      `select p.proname from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
              or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0))`,
    );
    expect(rows).toEqual([]);
  });

  it("does not let anon or PUBLIC execute a newly created function by default", async () => {
    await db.query("create function public.sec006_probe() returns int language sql as 'select 1'");
    try {
      const { rows } = await db.query(
        `select has_function_privilege('anon', 'public.sec006_probe()', 'EXECUTE') as anon,
                has_function_privilege('authenticated', 'public.sec006_probe()', 'EXECUTE') as authenticated`,
      );
      expect(rows[0]).toEqual({ anon: false, authenticated: false });
    } finally {
      await db.query("drop function public.sec006_probe()");
    }
  });

  it("lets only service_role run the couple credential check", async () => {
    const { rows } = await db.query(
      `select r.rolname from pg_roles r
       where r.rolname in ('anon', 'authenticated', 'service_role')
         and has_function_privilege(r.rolname, 'public.verify_event_credentials(text, text)', 'EXECUTE')`,
    );
    expect(rows.map((r) => r.rolname)).toEqual(["service_role"]);

    const { error } = await anon.rpc("verify_event_credentials", { p_username: "x", p_password: "y" });
    expect(error).not.toBeNull();
  });

  it("keeps staff-facing functions callable by authenticated", async () => {
    for (const fn of [
      "public.is_venue_staff_for(uuid)",
      "public.create_event_credentials(uuid, text, text)",
      "public.regenerate_event_password(uuid, text)",
      "public.get_event_username(uuid)",
      "public.set_venue_layout_password(uuid, text)",
      "public.verify_venue_layout_password(uuid, text)",
    ]) {
      const { rows } = await db.query(`select has_function_privilege('authenticated', $1, 'EXECUTE') as ok`, [fn]);
      expect(rows[0].ok, fn).toBe(true);
    }
  });
});
