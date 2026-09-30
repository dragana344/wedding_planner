import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

// DATA-004: every single-column foreign key in public has an index that
// starts with that column (a new FK without one fails here).
let db: Client;
beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

describe("foreign key indexes (DATA-004)", () => {
  it("indexes every foreign key column", async () => {
    const { rows } = await db.query(`
      select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
        and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])`);
    expect(rows).toEqual([]);
  });
});
