import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { EXPORTED_TABLES } from "@/lib/privacy/export";
import { COLUMN_CLASSIFICATION } from "./privacy-classification";

// DATA-005 guard: every column of every public table is classified in
// privacy-classification.ts. A new column fails this test until someone
// decides whether it is personal data, and so whether export
// (lib/privacy/export.ts) and erasure (migration 0043) must cover it.

/** Tables with personal columns that the venue export leaves out on purpose. */
const NOT_EXPORTED: Record<string, string> = {
  contact_submissions: "platform sales enquiries, not venue data; handled by the retention purge (DATA-007)",
  couple_sessions: "session secrets only",
  audit_log: "append-only security trail; holds user ids, never names or contact data",
};

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
});

afterAll(async () => {
  await db.end();
});

async function liveColumns(): Promise<Map<string, string[]>> {
  const { rows } = await db.query<{ table_name: string; column_name: string }>(`
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by 1, c.ordinal_position`);
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.table_name, [...(map.get(r.table_name) ?? []), r.column_name]);
  return map;
}

function unclassifiedColumns(live: Map<string, string[]>): string[] {
  const unclassified: string[] = [];
  for (const [table, columns] of Array.from(live)) {
    for (const column of columns) {
      if (!COLUMN_CLASSIFICATION[table]?.[column]) unclassified.push(`${table}.${column}`);
    }
  }
  return unclassified;
}

describe("personal-data guard (DATA-005)", () => {
  it("reports a new, unclassified column (self-check)", async () => {
    const live = await liveColumns();
    live.set("event_guests", [...(live.get("event_guests") ?? []), "unclassified_probe"]);
    live.set("brand_new_table", ["id"]);
    expect(unclassifiedColumns(live)).toEqual(["event_guests.unclassified_probe", "brand_new_table.id"]);
  });

  it("classifies every column of every public table", async () => {
    const unclassified = unclassifiedColumns(await liveColumns());
    expect(
      unclassified,
      "new column: classify it in COLUMN_CLASSIFICATION, and if it is personal make sure export and erasure cover it",
    ).toEqual([]);
  });

  it("has no stale entries for columns that no longer exist", async () => {
    const live = await liveColumns();
    const stale = Object.entries(COLUMN_CLASSIFICATION).flatMap(([table, cols]) =>
      Object.keys(cols)
        .filter((c) => !live.get(table)?.includes(c))
        .map((c) => `${table}.${c}`),
    );
    expect(stale).toEqual([]);
  });

  it("exports every table holding personal data, or excludes it with a reason", () => {
    const exported = new Set<string>(EXPORTED_TABLES);
    const missing = Object.entries(COLUMN_CLASSIFICATION)
      .filter(([, cols]) => Object.values(cols).some((c) => c === "personal" || c === "context"))
      .map(([table]) => table)
      .filter((table) => !exported.has(table) && !NOT_EXPORTED[table]);
    expect(missing).toEqual([]);
  });
});
