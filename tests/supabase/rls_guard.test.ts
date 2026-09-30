import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

// SEC-007: every public table has RLS, and every table is classified. A new
// table fails this test until someone decides who may touch it and adds it
// below (and grants accordingly in its migration).

/** Tables the venue panel reads/writes from the browser as `authenticated`, gated by RLS policies. */
const STAFF_TABLES = [
  "venues",
  "venue_staff",
  "rooms",
  "table_types",
  "menu_templates",
  "menu_items",
  "menu_template_items",
  "events",
  "event_rooms",
  "event_showcase_photos",
  "event_custom_menu_items",
  "room_fixed_elements",
  "room_layout_elements",
  "event_layout_elements",
  "event_seat_assignments",
  "reservations",
  "reservation_tables",
  "audit_log",
];

/** Tables only server code touches, with the service-role client. No API-role grants, no policies. */
const SERVICE_ROLE_ONLY_TABLES = [
  "event_credentials",
  "event_co_organizers",
  "event_reminders",
  "couple_sessions",
  "event_guests",
  "event_invitations",
  "event_agenda_items",
  "event_budget_items",
  "event_checklist_items",
  "event_checklist_subtasks",
  "event_locations",
  "event_menu_item_quantities",
  "event_notes",
  "contact_submissions",
  "rate_limits",
  "storage_cleanup_queue",
];

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
});

afterAll(async () => {
  await db.end();
});

async function publicTables(): Promise<{ name: string; rls: boolean; policies: number }[]> {
  const { rows } = await db.query(`
    select c.relname as name, c.relrowsecurity as rls,
           (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    order by 1`);
  return rows;
}

describe("RLS guard (SEC-007)", () => {
  it("has row level security enabled on every public table", async () => {
    const withoutRls = (await publicTables()).filter((t) => !t.rls).map((t) => t.name);
    expect(withoutRls).toEqual([]);
  });

  it("classifies every public table as staff (RLS policies) or service-role only", async () => {
    const known = new Set([...STAFF_TABLES, ...SERVICE_ROLE_ONLY_TABLES]);
    const unclassified = (await publicTables()).map((t) => t.name).filter((n) => !known.has(n));
    expect(unclassified, "new table: add it to STAFF_TABLES or SERVICE_ROLE_ONLY_TABLES").toEqual([]);
  });

  it("gives every staff table at least one policy and service-role tables none", async () => {
    const tables = new Map((await publicTables()).map((t) => [t.name, t]));
    for (const name of STAFF_TABLES) expect(tables.get(name)?.policies, name).toBeGreaterThan(0);
    for (const name of SERVICE_ROLE_ONLY_TABLES) expect(tables.get(name)?.policies, name).toBe(0);
  });

  it("grants authenticated nothing on service-role-only tables", async () => {
    const { rows } = await db.query(
      `select table_name from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public' and table_name = any($1)`,
      [SERVICE_ROLE_ONLY_TABLES],
    );
    expect(rows).toEqual([]);
  });
});
