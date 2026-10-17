# Venue Manager/Staff Login — Plan 1: Elevation Mechanism

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core "Login as Manager" mechanism — a venue manager (name + password, no separate Supabase Auth account) can elevate the current staff session in-browser, see it reflected in the account menu, and have it verified server-side; it drops the moment the page reloads or the tab/browser closes.

**Architecture:** New `venue_managers` (who the managers are, bcrypt password + 5-strike lockout, mirrors `event_credentials`) and `venue_manager_elevations` (opaque bearer tokens, SHA-256 hashed at rest, mirrors `couple_sessions`) tables. A `verify_venue_manager` Postgres RPC does the password check (same bcrypt/lockout shape as `verify_event_credentials`). `lib/venue/manager-elevation.ts` wraps both into `verifyVenueManager`/`createManagerElevation`/`validateManagerElevation`/`deleteManagerElevation`. Two API routes (`elevate`, `deauthorize`) front them. A React context (`ManagerElevationContext`) holds the returned token **only in memory** (never a cookie, never localStorage) and feeds the `AccountMenu` component, which gets a name+password elevation form and an "Одјави се од менаџер" action.

**Tech Stack:** Next.js App Router, Supabase (Postgres + pgcrypto for bcrypt, same as `event_credentials`), React Context, Vitest (unit + live-DB suites), Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-14-venue-manager-staff-login-design.md` (read this too — it has the full rationale and the permission matrix that later plans build on).

**Follow-up plans (not written yet, do not start on these):**
- Plan 2: gate the existing venue pages/actions per the spec's permission matrix (events, seating, Извештаи, Поставки) — requires converting the currently browser→Supabase-RLS-direct event mutations to go through a server check of the elevation token, since RLS alone cannot distinguish an elevated session from a plain staff session (both are the same underlying Supabase Auth user).
- Plan 3: owner-only "Менаџери" management UI (add/remove), "change my own password", forgot-manager-password email flow, `/signup` owner fields, existing-venue backfill script.

## Global Constraints

- RLS: `venue_managers` and `venue_manager_elevations` are enabled with **zero** anon/authenticated policies — service-role only, exactly the convention every couple/venue-adjacent table in this codebase already follows (see `supabase/migrations/0089_support_tickets.sql`'s header comment for the canonical wording).
- Password hashing: bcrypt via `extensions.crypt`/`extensions.gen_salt('bf', 10)`, the same as `event_credentials` (migration `0045_security_review_fixes.sql`) — do not add a new hashing dependency.
- Lockout: 5 failed attempts → 15 minute lock, identical shape to `verify_event_credentials`.
- An unknown manager name costs the same bcrypt work as a known one (timing-safe), same trick `verify_event_credentials` uses (`perform extensions.crypt(p_password, '<fixed bcrypt hash>')` on the not-found path).
- Elevation tokens: opaque 32-byte random hex (`randomBytes(32).toString("hex")`), stored **hashed** (SHA-256 via `lib/couple/session-hash.ts`'s `hashSessionToken`, reused not duplicated), 4-hour expiry, returned to the client in the **response body only** — never set as a cookie.
- The elevation token travels on later (Plan 2) requests as the header `x-venue-manager-token`. Name it exactly this now even though nothing reads it yet, so Plan 2 has a fixed contract.
- Every new migration number continues from `0089` (the last one in `supabase/migrations/`) — this plan's migration is `0090`.
- Rate limit the elevation endpoint the same way `coupleLogin` is limited (`lib/security/rate-limit.ts`'s `RATE_LIMITS`), fail-closed.
- The generic failure message for a wrong name/password/lockout must be identical across all three cases (no enumeration), mirroring `LOGIN_FAILED_MESSAGE` in `app/api/couple/login/route.ts`.

## Review Focus

- **A venue with zero manager rows elevates.** Nothing stops `verify_venue_manager` from being called before any manager exists for a venue (true for every venue until Plan 3's backfill runs) — the "not found" path must behave exactly like a wrong password, not throw or 500. Task 1's tests cover this.
- **Two different venues, same manager name.** `venue_managers` scopes uniqueness to `(venue_id, name)`; a lookup must never match a same-named manager at a *different* venue. Task 1/2 tests cover this explicitly with two venues.
- **An elevation token for venue A sent while browsing as venue B's staff.** `validateManagerElevation` must check the token's stored `venue_id` against the caller's own venue, not just that the token exists and is unexpired — Task 2's tests cover this.
- **A token that's expired but not yet garbage-collected.** `validateManagerElevation` checks `expires_at` itself rather than assuming an expired row has been deleted — Task 2's tests cover this.
- **Concurrent elevation attempts during a lockout window.** The lockout counter must be read-then-written inside the same RPC call (already atomic since it's one `plpgsql` function per call, same as `verify_event_credentials`) — Task 1's test confirms the 5th attempt locks and the 6th is refused even with a correct password.

---

### Task 1: Migration — `venue_managers`, `venue_manager_elevations`, `verify_venue_manager` RPC

**Files:**
- Create: `supabase/migrations/0090_venue_managers.sql`
- Test: `tests/supabase/venue_managers.test.ts`

**Interfaces:**
- Produces: table `venue_managers(id uuid pk, venue_id uuid fk, name text, password_hash text, is_owner boolean, failed_attempts int, locked_until timestamptz, created_at timestamptz)`, unique `(venue_id, name)`, partial unique index on `(venue_id)` where `is_owner`.
- Produces: table `venue_manager_elevations(token text pk, venue_id uuid fk, manager_id uuid fk, manager_name text, created_at timestamptz, expires_at timestamptz)`.
- Produces: RPC `verify_venue_manager(p_venue_id uuid, p_name text, p_password text) returns table(manager_id uuid, manager_name text, error_code text)` — `error_code` is `null` on success, else `'invalid'` or `'locked'`.
- Produces: RPC `create_venue_manager(p_venue_id uuid, p_name text, p_password text, p_is_owner boolean) returns uuid` (the new manager's id) — service-role only, used by later plans (signup, add-manager) but built now alongside the table since it's the only way to get a manager row in without hand-writing SQL in tests.

- [ ] **Step 1: Write the migration**

```sql
-- 0090: venue managers — a name+password pair per venue (not a separate
-- Supabase Auth account) that elevates the venue's existing single login
-- from "staff" to "manager" for the current browser tab only (spec
-- docs/superpowers/specs/2026-10-14-venue-manager-staff-login-design.md).
-- Same access pattern as every couple/venue-adjacent table since
-- Sub-project 2: RLS enabled with zero anon/authenticated policies,
-- service_role only — authorization is enforced entirely in application
-- code.

begin;

create table venue_managers (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  name text not null,
  password_hash text not null,
  is_owner boolean not null default false,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  unique (venue_id, name)
);
create index venue_managers_venue_id_idx on venue_managers(venue_id);
-- Exactly one owner per venue, same pattern as plans_single_default.
create unique index venue_managers_one_owner on venue_managers(venue_id) where is_owner;

alter table venue_managers enable row level security;

create table venue_manager_elevations (
  token text primary key,
  venue_id uuid not null references venues(id) on delete cascade,
  manager_id uuid not null references venue_managers(id) on delete cascade,
  manager_name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index venue_manager_elevations_venue_id_idx on venue_manager_elevations(venue_id);

alter table venue_manager_elevations enable row level security;

create or replace function public.verify_venue_manager(p_venue_id uuid, p_name text, p_password text)
returns table(manager_id uuid, manager_name text, error_code text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  mgr venue_managers%rowtype;
begin
  select * into mgr from venue_managers where venue_id = p_venue_id and name = p_name;
  if not found then
    -- Same bcrypt work as a real check, so response time does not reveal
    -- whether the name exists (same trick as verify_event_credentials).
    perform extensions.crypt(p_password, '$2a$10$amopzlEf9bwgwGGHg6UB4.q/rWaHJe5KyNsVOImbMPY31VjPUGeW6');
    return query select null::uuid, null::text, 'invalid'::text;
    return;
  end if;

  if mgr.locked_until is not null and mgr.locked_until > now() then
    return query select null::uuid, null::text, 'locked'::text;
    return;
  end if;

  if mgr.password_hash = extensions.crypt(p_password, mgr.password_hash) then
    update venue_managers set failed_attempts = 0, locked_until = null where id = mgr.id;
    return query select mgr.id, mgr.name, null::text;
  else
    update venue_managers
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
      where id = mgr.id;
    return query select null::uuid, null::text, 'invalid'::text;
  end if;
end;
$$;
revoke all on function public.verify_venue_manager(uuid, text, text) from public, anon, authenticated;
grant execute on function public.verify_venue_manager(uuid, text, text) to service_role;

create or replace function public.create_venue_manager(p_venue_id uuid, p_name text, p_password text, p_is_owner boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  if char_length(coalesce(p_password, '')) < 8 then
    raise exception 'Лозинката мора да има најмалку 8 знаци.' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_name), '')) = 0 then
    raise exception 'Внесете име.' using errcode = '22023';
  end if;
  insert into venue_managers (venue_id, name, password_hash, is_owner)
  values (p_venue_id, p_name, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), p_is_owner)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_venue_manager(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_venue_manager(uuid, text, text, boolean) to service_role;

commit;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up`
Expected: `{"applied":["/Users/.../supabase/migrations/0090_venue_managers.sql"],"message":"Migrations applied"}`

- [ ] **Step 3: Write the failing tests**

```typescript
// tests/supabase/venue_managers.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueA: string;
let venueB: string;

beforeAll(async () => {
  venueA = (await admin.from("venues").insert({ name: `Managers Venue A ${stamp}` }).select("id").single()).data!.id;
  venueB = (await admin.from("venues").insert({ name: `Managers Venue B ${stamp}` }).select("id").single()).data!.id;
});
afterAll(async () => {
  await admin.from("venues").delete().in("id", [venueA, venueB]);
});

describe("venue_managers / verify_venue_manager", () => {
  it("creates a manager and verifies the correct password", async () => {
    const { data: managerId, error } = await admin.rpc("create_venue_manager", {
      p_venue_id: venueA, p_name: "Марко", p_password: "sister-moon-42", p_is_owner: true,
    });
    expect(error).toBeNull();
    expect(managerId).toBeTruthy();

    const { data } = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Марко", p_password: "sister-moon-42" });
    expect(data![0]).toMatchObject({ manager_id: managerId, manager_name: "Марко", error_code: null });
  });

  it("refuses a wrong password without revealing whether the name exists", async () => {
    const wrongPassword = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Марко", p_password: "nope" });
    expect(wrongPassword.data![0].error_code).toBe("invalid");
    const unknownName = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Nobody", p_password: "nope" });
    expect(unknownName.data![0].error_code).toBe("invalid");
  });

  it("locks out after 5 failed attempts, then refuses even the right password", async () => {
    await admin.rpc("create_venue_manager", { p_venue_id: venueA, p_name: "Ана", p_password: "correct-horse-1", p_is_owner: false });
    for (let i = 0; i < 5; i++) {
      await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Ана", p_password: "wrong" });
    }
    const { data } = await admin.rpc("verify_venue_manager", { p_venue_id: venueA, p_name: "Ана", p_password: "correct-horse-1" });
    expect(data![0].error_code).toBe("locked");
  });

  it("scopes manager names to their own venue — same name at a different venue is a different manager", async () => {
    await admin.rpc("create_venue_manager", { p_venue_id: venueA, p_name: "Петар", p_password: "venue-a-pass-1", p_is_owner: false });
    await admin.rpc("create_venue_manager", { p_venue_id: venueB, p_name: "Петар", p_password: "venue-b-pass-1", p_is_owner: false });

    const crossCheck = await admin.rpc("verify_venue_manager", { p_venue_id: venueB, p_name: "Петар", p_password: "venue-a-pass-1" });
    expect(crossCheck.data![0].error_code).toBe("invalid");
    const ownCheck = await admin.rpc("verify_venue_manager", { p_venue_id: venueB, p_name: "Петар", p_password: "venue-b-pass-1" });
    expect(ownCheck.data![0].error_code).toBeNull();
  });

  it("allows only one owner per venue", async () => {
    const { error } = await admin.rpc("create_venue_manager", { p_venue_id: venueA, p_name: "Втор Сопственик", p_password: "second-owner-1", p_is_owner: true });
    // RPC calls return { data: null, error } on failure, they don't throw.
    // A unique-index violation's Postgres message includes the index name.
    expect(error).not.toBeNull();
    expect(error!.message).toContain("venue_managers_one_owner");
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:db -- tests/supabase/venue_managers.test.ts`
Expected: PASS, 5 tests. If the last test fails because the actual error message differs from `venue_managers_one_owner` (Postgres/PostgREST version differences are possible), read the printed `error!.message` from the failing assertion and update the `toContain(...)` argument to match it exactly — the behavior (owner creation refused) is what matters, the exact wording is incidental.

- [ ] **Step 5: Add this table to the classification/RLS guard tests**

`tests/supabase/privacy-classification.ts`: add, right after the `storage_cleanup_queue` or `support_tickets` entry (whichever is last):
```typescript
  venue_managers: { id: N, venue_id: N, name: P, password_hash: S, is_owner: N, failed_attempts: N, locked_until: N, created_at: N },
  venue_manager_elevations: { token: S, venue_id: N, manager_id: N, manager_name: P, created_at: N, expires_at: N },
```

`tests/supabase/rls_guard.test.ts`: add both table names to the `SERVICE_ROLE_ONLY_TABLES` array.

Run: `npm run test:db -- tests/supabase/privacy_guard.test.ts tests/supabase/rls_guard.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0090_venue_managers.sql tests/supabase/venue_managers.test.ts tests/supabase/privacy-classification.ts tests/supabase/rls_guard.test.ts
git commit -m "feat: add venue_managers table, lockout, and one-owner-per-venue constraint"
```

---

### Task 2: `lib/venue/manager-elevation.ts`

**Files:**
- Create: `lib/venue/manager-elevation.ts`
- Test: `tests/supabase/manager_elevation_lib.test.ts`

**Interfaces:**
- Consumes: RPCs `verify_venue_manager`, `create_venue_manager` from Task 1; `hashSessionToken` from `lib/couple/session-hash.ts` (reused, not duplicated — it's pure Web Crypto SHA-256, nothing couple-specific about it despite its current location); `createServiceRoleClient` from `lib/supabase/service-role.ts`.
- Produces:
  - `export async function verifyVenueManager(venueId: string, name: string, password: string): Promise<{ managerId: string; managerName: string } | { errorCode: "invalid" | "locked" }>`
  - `export async function createManagerElevation(venueId: string, managerId: string, managerName: string): Promise<{ token: string; expiresAt: Date; managerName: string }>`
  - `export async function validateManagerElevation(token: string, venueId: string): Promise<{ managerId: string; managerName: string } | null>` — `null` if the token doesn't exist, is expired, or belongs to a different venue.
  - `export async function deleteManagerElevation(token: string): Promise<void>`
  - `export const MANAGER_ELEVATION_DURATION_MS: number` (4 hours, `4 * 60 * 60 * 1000`)

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/supabase/manager_elevation_lib.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  verifyVenueManager, createManagerElevation, validateManagerElevation, deleteManagerElevation,
} from "@/lib/venue/manager-elevation";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let otherVenueId: string;
let managerId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Elevation Venue ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Other Venue ${stamp}` }).select("id").single()).data!.id;
  managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Елена", p_password: "correct-password-1", p_is_owner: true })).data as string;
});
afterAll(async () => {
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

describe("verifyVenueManager", () => {
  it("resolves the manager on a correct password", async () => {
    const result = await verifyVenueManager(venueId, "Елена", "correct-password-1");
    expect(result).toEqual({ managerId, managerName: "Елена" });
  });

  it("returns errorCode 'invalid' on a wrong password", async () => {
    const result = await verifyVenueManager(venueId, "Елена", "wrong");
    expect(result).toEqual({ errorCode: "invalid" });
  });
});

describe("manager elevation tokens", () => {
  it("creates a token, validates it for the right venue, and rejects it for a different venue", async () => {
    const elevation = await createManagerElevation(venueId, managerId, "Елена");
    expect(elevation.token).toHaveLength(64); // 32 bytes, hex
    expect(elevation.managerName).toBe("Елена");

    const valid = await validateManagerElevation(elevation.token, venueId);
    expect(valid).toEqual({ managerId, managerName: "Елена" });

    const wrongVenue = await validateManagerElevation(elevation.token, otherVenueId);
    expect(wrongVenue).toBeNull();
  });

  it("stores the token hashed, not in the clear", async () => {
    const elevation = await createManagerElevation(venueId, managerId, "Елена");
    const { data } = await admin.from("venue_manager_elevations").select("token").eq("manager_id", managerId).order("created_at", { ascending: false }).limit(1).single();
    expect(data!.token).not.toBe(elevation.token);
  });

  it("rejects an expired token", async () => {
    const elevation = await createManagerElevation(venueId, managerId, "Елена");
    await admin.from("venue_manager_elevations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("manager_id", managerId);
    const result = await validateManagerElevation(elevation.token, venueId);
    expect(result).toBeNull();
  });

  it("deletes a token so it no longer validates", async () => {
    const elevation = await createManagerElevation(venueId, managerId, "Елена");
    await deleteManagerElevation(elevation.token);
    const result = await validateManagerElevation(elevation.token, venueId);
    expect(result).toBeNull();
  });

  it("rejects a token that was never issued", async () => {
    const result = await validateManagerElevation("0".repeat(64), venueId);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:db -- tests/supabase/manager_elevation_lib.test.ts`
Expected: FAIL with "Cannot find module '@/lib/venue/manager-elevation'"

- [ ] **Step 3: Write the implementation**

```typescript
// lib/venue/manager-elevation.ts
import "server-only";
import { randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashSessionToken } from "@/lib/couple/session-hash";

export const MANAGER_ELEVATION_DURATION_MS = 4 * 60 * 60 * 1000;

export type VerifyManagerResult = { managerId: string; managerName: string } | { errorCode: "invalid" | "locked" };

export async function verifyVenueManager(venueId: string, name: string, password: string): Promise<VerifyManagerResult> {
  const client = createServiceRoleClient();
  const { data, error } = await client.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: name, p_password: password });
  if (error) throw error;
  const row = data![0] as { manager_id: string | null; manager_name: string | null; error_code: "invalid" | "locked" | null };
  if (row.error_code) return { errorCode: row.error_code };
  return { managerId: row.manager_id!, managerName: row.manager_name! };
}

export async function createManagerElevation(
  venueId: string,
  managerId: string,
  managerName: string
): Promise<{ token: string; expiresAt: Date; managerName: string }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MANAGER_ELEVATION_DURATION_MS);
  const client = createServiceRoleClient();
  const { error } = await client.from("venue_manager_elevations").insert({
    token: await hashSessionToken(token),
    venue_id: venueId,
    manager_id: managerId,
    manager_name: managerName,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
  return { token, expiresAt, managerName };
}

export async function validateManagerElevation(token: string, venueId: string): Promise<{ managerId: string; managerName: string } | null> {
  const client = createServiceRoleClient();
  const tokenHash = await hashSessionToken(token);
  const { data } = await client
    .from("venue_manager_elevations")
    .select("manager_id, manager_name, venue_id, expires_at")
    .eq("token", tokenHash)
    .maybeSingle();
  if (!data) return null;
  if (data.venue_id !== venueId) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return { managerId: data.manager_id, managerName: data.manager_name };
}

export async function deleteManagerElevation(token: string): Promise<void> {
  const client = createServiceRoleClient();
  await client.from("venue_manager_elevations").delete().eq("token", await hashSessionToken(token));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:db -- tests/supabase/manager_elevation_lib.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add lib/venue/manager-elevation.ts tests/supabase/manager_elevation_lib.test.ts
git commit -m "feat: add lib/venue/manager-elevation.ts (verify, elevate, validate, revoke)"
```

---

### Task 3: API routes — elevate and deauthorize

**Files:**
- Create: `app/api/venue/managers/elevate/route.ts`
- Create: `app/api/venue/managers/deauthorize/route.ts`
- Modify: `lib/api/schemas.ts` (add `managerElevationBody`)
- Modify: `lib/security/rate-limit.ts` (add `RATE_LIMITS.managerElevation`)
- Test: `tests/supabase/manager_elevation_routes.test.ts`

**Interfaces:**
- Consumes: `verifyVenueManager`, `createManagerElevation`, `deleteManagerElevation` from Task 2; `getCurrentVenueId` from `lib/venue/current-venue.ts`; `createServerSupabaseClient` from `lib/supabase/server.ts`; `checkRateLimit`/`clientIp`/`rateLimitedResponse`/`RATE_LIMITS` from `lib/security/rate-limit.ts`; `withPublic`/`parseInput` from `lib/api/handler.ts`/`lib/api/schemas.ts`; `logSecurityEvent` from `lib/log.ts`.
- Produces: `POST /api/venue/managers/elevate` — body `{ name: string, password: string }`, `200 { token: string, expiresAt: string, managerName: string }` on success, `401 { error: string }` on bad credentials/lockout/no venue session. `POST /api/venue/managers/deauthorize` — body `{ token: string }`, always `200 { ok: true }` (deleting a token that doesn't exist is a no-op, not an error).

- [ ] **Step 1: Add the schema**

In `lib/api/schemas.ts`, right after `loginBody` (couple login section):
```typescript
// ---------------------------------------------------------------------------
// Venue manager elevation

export const MANAGER_ELEVATION_REQUIRED_ERROR = "Задолжителни се името и лозинката.";
export const managerElevationBody = z.object(
  {
    name: z.string({ error: MANAGER_ELEVATION_REQUIRED_ERROR }).min(1, { error: MANAGER_ELEVATION_REQUIRED_ERROR }).max(NAME_MAX),
    password: z.string({ error: MANAGER_ELEVATION_REQUIRED_ERROR }).min(1, { error: MANAGER_ELEVATION_REQUIRED_ERROR }).max(1000),
  },
  { error: INVALID_JSON_ERROR },
);
export const managerDeauthorizeBody = z.object(
  { token: z.string({ error: INVALID_JSON_ERROR }).min(1) },
  { error: INVALID_JSON_ERROR },
);
```

- [ ] **Step 2: Add the rate limit**

In `lib/security/rate-limit.ts`'s `RATE_LIMITS`, right after `coupleLogin`:
```typescript
  managerElevation: { bucket: "manager-elevation", limit: 10, windowSeconds: 60, failClosed: true },
```

- [ ] **Step 3: Write the failing route tests**

```typescript
// tests/supabase/manager_elevation_routes.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let userId: string;
let staffClient: ReturnType<typeof createClient>;
const EMAIL = `elevation-route-${stamp}@test.local`;
const PASSWORD = "staff-password-123";

vi.mock("@/lib/supabase/server", async () => {
  const { createClient: create } = await import("@supabase/supabase-js");
  return {
    createServerSupabaseClient: async () => {
      const c = create(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      return c;
    },
  };
});

import { POST as elevateRoute } from "@/app/api/venue/managers/elevate/route";
import { POST as deauthorizeRoute } from "@/app/api/venue/managers/deauthorize/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/venue/managers/elevate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Elevation Route Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Тест Менаџер", p_password: "manager-pass-1", p_is_owner: true });
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("POST /api/venue/managers/elevate", () => {
  it("elevates with the correct name and password", async () => {
    const res = await elevateRoute(req({ name: "Тест Менаџер", password: "manager-pass-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.managerName).toBe("Тест Менаџер");
    expect(typeof body.token).toBe("string");
  });

  it("refuses a wrong password with a generic message", async () => {
    const res = await elevateRoute(req({ name: "Тест Менаџер", password: "wrong" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("rejects a malformed body", async () => {
    const res = await elevateRoute(req({ name: "" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/venue/managers/deauthorize", () => {
  it("revokes a token so it can no longer validate", async () => {
    const elevated = await elevateRoute(req({ name: "Тест Менаџер", password: "manager-pass-1" }));
    const { token } = await elevated.json();

    const deauth = await deauthorizeRoute(
      new NextRequest("http://localhost/api/venue/managers/deauthorize", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }),
      })
    );
    expect(deauth.status).toBe(200);

    const { validateManagerElevation } = await import("@/lib/venue/manager-elevation");
    expect(await validateManagerElevation(token, venueId)).toBeNull();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:db -- tests/supabase/manager_elevation_routes.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/venue/managers/elevate/route'"

- [ ] **Step 5: Write the elevate route**

```typescript
// app/api/venue/managers/elevate/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { verifyVenueManager, createManagerElevation } from "@/lib/venue/manager-elevation";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { MANAGER_ELEVATION_REQUIRED_ERROR, managerElevationBody } from "@/lib/api/schemas";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";
import { logSecurityEvent } from "@/lib/log";

// SEC-022 style: one message for a wrong password, an unknown manager name,
// and a locked account, so the response never confirms a name exists.
const ELEVATION_FAILED_MESSAGE = "Неточно име или лозинка. По повеќе неуспешни обиди се блокира привремено.";

export const POST = withPublic(
  async ({ request, body }) => {
    const limit = await checkRateLimit(RATE_LIMITS.managerElevation, clientIp(request));
    if (!limit.ok) return rateLimitedResponse(limit);

    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: "Сесијата истече. Најавете се повторно." }, { status: 401 });

    try {
      const result = await verifyVenueManager(venueId, body.name, body.password);
      if ("errorCode" in result) {
        logSecurityEvent(result.errorCode === "locked" ? "manager_elevation_locked" : "manager_elevation_failed", { venue_id: venueId });
        return NextResponse.json({ error: ELEVATION_FAILED_MESSAGE }, { status: 401 });
      }
      logSecurityEvent("manager_elevation_succeeded", { venue_id: venueId, manager_id: result.managerId });
      const elevation = await createManagerElevation(venueId, result.managerId, result.managerName);
      return NextResponse.json({ token: elevation.token, expiresAt: elevation.expiresAt.toISOString(), managerName: elevation.managerName });
    } catch (err) {
      return errorResponse(err, "Најавата како менаџер не успеа. Обидете се повторно.", request);
    }
  },
  { invalidJsonError: "Invalid JSON body", body: managerElevationBody, invalidBodyError: MANAGER_ELEVATION_REQUIRED_ERROR },
);
```

- [ ] **Step 6: Write the deauthorize route**

```typescript
// app/api/venue/managers/deauthorize/route.ts
import { NextResponse } from "next/server";
import { deleteManagerElevation } from "@/lib/venue/manager-elevation";
import { withPublic } from "@/lib/api/handler";
import { managerDeauthorizeBody } from "@/lib/api/schemas";

// Deliberately always 200: revoking a token that's already gone (expired,
// already revoked, never existed) is not an error — the caller's goal
// ("make sure I'm not elevated") is already satisfied either way.
export const POST = withPublic(
  async ({ body }) => {
    await deleteManagerElevation(body.token);
    return NextResponse.json({ ok: true });
  },
  { invalidJsonError: "Invalid JSON body", body: managerDeauthorizeBody, invalidBodyError: "Invalid JSON body" },
);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:db -- tests/supabase/manager_elevation_routes.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 8: Commit**

```bash
git add app/api/venue/managers lib/api/schemas.ts lib/security/rate-limit.ts tests/supabase/manager_elevation_routes.test.ts
git commit -m "feat: add /api/venue/managers/elevate and /deauthorize routes"
```

---

### Task 4: `ManagerElevationContext`

**Files:**
- Create: `components/venue/shell/ManagerElevationContext.tsx`
- Modify: `components/venue/shell/PanelShell.tsx` (wrap children in the provider)
- Test: `tests/components/venue/shell/ManagerElevationContext.test.tsx`

**Interfaces:**
- Produces: `ManagerElevationProvider` (React component, wraps children), `useManagerElevation()` hook returning:
  ```typescript
  {
    managerName: string | null; // null = plain staff, not elevated
    elevate: (name: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
    deAuthorize: () => void;
  }
  ```
- Consumes: nothing from earlier tasks directly — calls the Task 3 routes by URL (`fetch("/api/venue/managers/elevate", ...)`), keeping this a plain client component with no server-only imports.

**Design note:** state (`token`, `managerName`, `expiresAt`) lives in `useState` inside the provider — a component mount's initial state. Because `PanelShell` (which hosts this provider) is remounted on every full page load/navigation in this app (it's rendered per-request by the server layout, not kept alive across navigations the way a persistent app shell in an SPA would be), a `useState` initializer naturally starts at "not elevated" on every fresh page load — satisfying the spec's "drops on refresh" requirement with no extra code. Do not add any `localStorage`/`sessionStorage`/cookie persistence here — that would defeat the point.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/components/venue/shell/ManagerElevationContext.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ManagerElevationProvider, useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";

function Probe() {
  const { managerName, elevate, deAuthorize } = useManagerElevation();
  return (
    <div>
      <p data-testid="status">{managerName ?? "staff"}</p>
      <button onClick={() => elevate("Марко", "pw-1")}>elevate</button>
      <button onClick={deAuthorize}>deauthorize</button>
    </div>
  );
}

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

describe("ManagerElevationContext", () => {
  it("starts as plain staff (not elevated)", () => {
    render(<ManagerElevationProvider><Probe /></ManagerElevationProvider>);
    expect(screen.getByTestId("status")).toHaveTextContent("staff");
  });

  it("elevates on success and reflects the manager's name", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: "abc123", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко" }) });
    render(<ManagerElevationProvider><Probe /></ManagerElevationProvider>);
    fireEvent.click(screen.getByText("elevate"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("Марко"));
  });

  it("stays staff and surfaces the error on a failed elevation", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Неточно име или лозинка." }) });
    let captured: { ok: true } | { ok: false; error: string } | undefined;
    function CaptureProbe() {
      const { elevate } = useManagerElevation();
      return <button onClick={async () => { captured = await elevate("Марко", "wrong"); }}>go</button>;
    }
    render(<ManagerElevationProvider><CaptureProbe /></ManagerElevationProvider>);
    fireEvent.click(screen.getByText("go"));
    await waitFor(() => expect(captured).toEqual({ ok: false, error: "Неточно име или лозинка." }));
  });

  it("deAuthorize clears the elevated state and calls the deauthorize endpoint", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: "abc123", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<ManagerElevationProvider><Probe /></ManagerElevationProvider>);
    fireEvent.click(screen.getByText("elevate"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("Марко"));

    fireEvent.click(screen.getByText("deauthorize"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("staff"));
    expect(mockFetch).toHaveBeenCalledWith("/api/venue/managers/deauthorize", expect.objectContaining({ method: "POST" }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/venue/shell/ManagerElevationContext.test.tsx`
Expected: FAIL with "Cannot find module '@/components/venue/shell/ManagerElevationContext'"

- [ ] **Step 3: Write the implementation**

```typescript
// components/venue/shell/ManagerElevationContext.tsx
"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ElevationState = { token: string; managerName: string; expiresAt: string } | null;

type ManagerElevationValue = {
  managerName: string | null;
  elevate: (name: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  deAuthorize: () => void;
  /** Plan 2 reads this to attach the x-venue-manager-token header on gated requests. */
  token: string | null;
};

const ManagerElevationContext = createContext<ManagerElevationValue | null>(null);

/** Elevation state lives only in this component's React state — never a
 * cookie, never localStorage. PanelShell (the host of this provider) is
 * rendered fresh per page load in this app, so a plain useState initializer
 * already satisfies "drops on refresh" with no extra code; do not add any
 * persistence here. */
export function ManagerElevationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ElevationState>(null);

  const elevate = useCallback(async (name: string, password: string) => {
    const response = await fetch("/api/venue/managers/elevate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return { ok: false as const, error: data?.error ?? "Најавата како менаџер не успеа." };
    setState({ token: data.token, managerName: data.managerName, expiresAt: data.expiresAt });
    return { ok: true as const };
  }, []);

  const deAuthorize = useCallback(() => {
    if (state) {
      fetch("/api/venue/managers/deauthorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: state.token }),
      }).catch(() => undefined);
    }
    setState(null);
  }, [state]);

  return (
    <ManagerElevationContext.Provider value={{ managerName: state?.managerName ?? null, token: state?.token ?? null, elevate, deAuthorize }}>
      {children}
    </ManagerElevationContext.Provider>
  );
}

export function useManagerElevation(): ManagerElevationValue {
  const ctx = useContext(ManagerElevationContext);
  if (!ctx) throw new Error("useManagerElevation must be used within ManagerElevationProvider");
  return ctx;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/venue/shell/ManagerElevationContext.test.tsx`
Expected: PASS, 4 tests

- [ ] **Step 5: Wrap `PanelShell` in the provider**

In `components/venue/shell/PanelShell.tsx`, add the import:
```typescript
import { ManagerElevationProvider } from "./ManagerElevationContext";
```
Find the component's returned root element (`<div className={\`vp app...\`}>...</div>`) and wrap everything inside it with `<ManagerElevationProvider>...</ManagerElevationProvider>`, so `AccountMenu` (a descendant) can call `useManagerElevation()`.

- [ ] **Step 6: Run the full venue shell test suite to confirm nothing broke**

Run: `npx vitest run tests/components/venue/shell/`
Expected: PASS (existing `PanelShellLocks.test.tsx`, `AccountMenu.test.tsx`, `Drawer.test.tsx`, `OnboardingTour.test.tsx` all still pass)

- [ ] **Step 7: Commit**

```bash
git add components/venue/shell/ManagerElevationContext.tsx components/venue/shell/PanelShell.tsx tests/components/venue/shell/ManagerElevationContext.test.tsx
git commit -m "feat: add ManagerElevationContext and wire it into PanelShell"
```

---

### Task 5: Wire `AccountMenu` to the elevation state

**Files:**
- Modify: `components/venue/shell/AccountMenu.tsx`
- Modify: `tests/components/venue/shell/AccountMenu.test.tsx`

**Interfaces:**
- Consumes: `useManagerElevation()` from Task 4.

**Design:** staff mode shows a **"Логирај се како менаџер"** menu item that, when clicked, replaces the menu's contents with a small inline name+password form (not a separate modal — keeps it inside the same dropdown) with its own submit button and error display. Elevated mode shows the manager's name next to "Менаџер" instead of the venue's role label, and swaps the Поставки-area control for **"Одјави се од менаџер"**. Note this task does **not** touch the "Поставки" link's visibility rules (that's Plan 3, once Поставки itself becomes owner-gated) — for now it keeps linking to `/venue/settings` unconditionally, same as today.

- [ ] **Step 1: Write the failing tests**

Replace the contents of `tests/components/venue/shell/AccountMenu.test.tsx` with:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountMenu } from "@/components/venue/shell/AccountMenu";
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => ({ auth: { signOut } }) }));

const mockFetch = vi.fn();
beforeEach(() => {
  mockPush.mockReset();
  signOut.mockClear();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

function renderMenu() {
  return render(
    <ManagerElevationProvider>
      <AccountMenu venueName="Сала Езеро" userRole="Менаџер" />
    </ManagerElevationProvider>
  );
}

describe("AccountMenu — manager elevation", () => {
  it("shows 'Логирај се како менаџер' when not elevated", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    expect(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ })).toBeInTheDocument();
    expect(screen.queryByText("Одјави се од менаџер")).not.toBeInTheDocument();
  });

  it("opens the name/password form, elevates on submit, and then shows 'Одјави се од менаџер'", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: "tok1", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко" }) });
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));

    fireEvent.change(screen.getByLabelText("Име"), { target: { value: "Марко" } });
    fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "pw-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Најави се" }));

    await waitFor(() => expect(screen.getByText(/Марко/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Марко/ }));
    expect(screen.getByRole("menuitem", { name: "Одјави се од менаџер" })).toBeInTheDocument();
  });

  it("shows the server's error message on a failed elevation attempt", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Неточно име или лозинка." }) });
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));
    fireEvent.change(screen.getByLabelText("Име"), { target: { value: "Марко" } });
    fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
    expect(await screen.findByText("Неточно име или лозинка.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/venue/shell/AccountMenu.test.tsx`
Expected: FAIL (no "Логирај се како менаџер" text exists yet)

- [ ] **Step 3: Rewrite `AccountMenu.tsx`**

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./Icon";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useManagerElevation } from "./ManagerElevationContext";

export function AccountMenu({ venueName, userRole }: { venueName: string; userRole: string }) {
  const [open, setOpen] = useState(false);
  const [showElevateForm, setShowElevateForm] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [elevateError, setElevateError] = useState<string | null>(null);
  const [isElevating, setIsElevating] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { managerName, elevate, deAuthorize } = useManagerElevation();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowElevateForm(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setShowElevateForm(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    setIsSigningOut(true);
    await createBrowserSupabaseClient().auth.signOut({ scope: "local" });
    router.push("/login");
  }

  async function handleElevateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setElevateError(null);
    setIsElevating(true);
    const result = await elevate(name, password);
    setIsElevating(false);
    if (!result.ok) {
      setElevateError(result.error);
      return;
    }
    setName("");
    setPassword("");
    setShowElevateForm(false);
  }

  return (
    <div className="who-wrap" ref={wrapRef}>
      <button className="who" type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="user-circle" size="lg" style={{ color: "var(--ink-2)" }} />
        <span>
          <span className="n">{venueName}</span>
          <br />
          <span className="r">{managerName ? `Менаџер: ${managerName}` : userRole}</span>
        </span>
        <Icon name="down" size="sm" style={{ color: "var(--faint)" }} />
      </button>
      {open ? (
        <div className="who-menu" role="menu">
          {showElevateForm ? (
            <form onSubmit={handleElevateSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 10px" }}>
              <div>
                <label className="lab-s" htmlFor="elevate-name">Име</label>
                <input id="elevate-name" className="fld" value={name} onChange={(e) => setName(e.target.value)} required disabled={isElevating} />
              </div>
              <div>
                <label className="lab-s" htmlFor="elevate-password">Лозинка</label>
                <input id="elevate-password" className="fld" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isElevating} />
              </div>
              {elevateError ? <p style={{ color: "var(--bad)", fontSize: 12.5, margin: 0 }}>{elevateError}</p> : null}
              <button type="submit" className="btn btn-gold" disabled={isElevating}>
                {isElevating ? "Се најавува..." : "Најави се"}
              </button>
            </form>
          ) : (
            <>
              <Link href="/venue/settings" role="menuitem" onClick={() => setOpen(false)}>
                <Icon name="gear" size="sm" /> Поставки
              </Link>
              {managerName ? (
                <button type="button" role="menuitem" onClick={() => { deAuthorize(); setOpen(false); }}>
                  <Icon name="left" size="sm" /> Одјави се од менаџер
                </button>
              ) : (
                <button type="button" role="menuitem" onClick={() => setShowElevateForm(true)}>
                  <Icon name="user-circle" size="sm" /> Логирај се како менаџер
                </button>
              )}
              <button type="button" role="menuitem" onClick={handleSignOut} disabled={isSigningOut}>
                <Icon name="left" size="sm" /> {isSigningOut ? "Се одјавува..." : "Одјави се"}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/venue/shell/AccountMenu.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add components/venue/shell/AccountMenu.tsx tests/components/venue/shell/AccountMenu.test.tsx
git commit -m "feat: AccountMenu elevates/de-elevates manager mode in place"
```

---

### Task 6: Final verification

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no output (clean)

- [ ] **Step 2: Full unit suite**

Run: `npm run test:unit`
Expected: all green, no regressions in previously-passing files

- [ ] **Step 3: Full live-DB suite**

Run: `npm run test:db`
Expected: all green (rerun once if a failure looks like the project's known parallel-test-pollution flakiness in unrelated files — see `tests/lib/media/photos.test.ts` — before treating it as a real regression)

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: succeeds, no new route errors; confirm `/api/venue/managers/elevate` and `/api/venue/managers/deauthorize` appear in the route list

- [ ] **Step 5: Commit any final fixups**

```bash
git add -A
git commit -m "chore: final verification pass for venue manager elevation (Plan 1)"
```
(Skip this commit if Steps 1–4 needed no changes.)
