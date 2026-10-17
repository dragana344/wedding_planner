# Venue Manager/Staff Login — Plan 2: Gate Events, Settings, Reports

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the spec's permission matrix for event create/edit/delete, Поставки (owner-only), Извештаи (manager/owner-only), and the two privacy routes (export, delete-account) — independently re-verified server-side on every gated action, not just hidden buttons.

**Architecture:** Event mutations currently write straight from the browser to Postgres via RLS alone (`lib/venue/events.ts` functions calling `resolveSupabaseClient()`), and Поставки/Извештаи embed their real data directly in the server-rendered page. Neither can be gated by the manager-elevation token as-is, because that token lives only in browser memory (spec D2) and never reaches a Server Component. This plan moves the gated writes behind new `app/api/venue/events/*` routes that check the token (sent as a header on an explicit client-side `fetch`, not the implicit RSC navigation), and converts Извештаи's real data fetch to the same client-fetch-after-check pattern. Поставки keeps its existing field-level RLS writes for v1 (documented gap below) but gets a client-side owner-only visibility gate plus a server-side owner check on the two privacy routes that already exist.

**Tech Stack:** Next.js App Router (Route Handlers, not Server Actions — this codebase has none under `app/venue`), Supabase (Postgres + RLS), Vitest (unit + live-DB suites), Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-14-venue-manager-staff-login-design.md`. Also read Plan 1 (`docs/superpowers/plans/2026-10-14-venue-manager-staff-login.md`) — already implemented, uncommitted — for the exact shape of `lib/venue/manager-elevation.ts`, the elevate/deauthorize routes, and `ManagerElevationContext`, all of which this plan modifies or builds on.

**Follow-up plans:**
- Plan 3 (not written yet): owner-only "Менаџери" management UI, change-own-manager-password, forgot-manager-password, `/signup` owner fields, existing-venue backfill.
- Plan 4 (not written, not scoped): gate per-event seating/table-layout edits (`lib/venue/floorplan-history.ts`'s `venueHistoryActions`, including its undo/redo history-store and `restore_staff_layout` RPC) — deliberately deferred out of this plan because it needs its own design pass, not a bolt-on gate.

## Global Constraints

- The manager-elevation token travels as the header `x-venue-manager-token` (fixed in Plan 1's Global Constraints) — every new gated route reads it with this exact name.
- Gated routes use the **cookie-bound server Supabase client** (`createServerSupabaseClient()`), not the service-role client, for the actual DB write — RLS (`is_venue_staff_for`) stays a second, independent gate under the elevation check, exactly as it already is for every other venue write.
- A missing, invalid, expired, or wrong-venue elevation token on a gated route is a `403` with a single generic message — never reveal *why* (missing vs expired vs wrong venue) in the response.
- Every new migration number continues from Plan 1's last one (`0093`) — this plan's migration is `0094`.
- Request body schemas live in `lib/api/schemas.ts` (SEC-004 convention) — add to that file, don't inline validation in route handlers.
- Follow the error-handling convention already in every route in this codebase: user-facing domain errors (`throw new Error("...")`, e.g. `createEvent`'s "Менито не припаѓа на овој локал.") pass through `errorResponse()` verbatim; anything else becomes the route's generic fallback message, logged server-side (SEC-003).
- **Documented gap, not a bug:** this plan does not convert Поставки's profile/branding/floor-plan-lock-password writes to gated routes — they stay RLS-only, same as today. Only the page's *visibility* becomes owner-gated (client-side), and the two already-server-side privacy routes (export, delete-account) get a real owner check. This is a deliberate, narrower scope than "every Поставки action is independently re-verified" — flag it to your human partner in your final report rather than silently expanding scope to cover it.

## Review Focus

- **A plain staff session (never elevated) hits a gated route directly** (curl, devtools, stale tab) with no `x-venue-manager-token` header at all — must get the same 403 as a wrong/expired token, never a 500 or a different error shape. Task 3's tests cover this for every new route.
- **An elevation token for a *different* venue** sent to a gated route for this venue (copy-pasted header, or a stale token from a venue the manager used to work at) — `requireManagerElevation` must check the token's own `venue_id`, not just that it's valid *somewhere*. Task 2's tests cover this (it's Plan 1's `validateManagerElevation` behavior, reused).
- **A non-owner manager hits the owner-only routes** (export, delete-account) — elevated but not owner must still be refused. Task 4's tests cover this explicitly (not just "staff refused").
- **Извештаи rendered for a URL with no `room`/`from`/`to` query params** by a non-elevated viewer — must not leak real totals even as a flash-of-real-content before the client-side check runs; the server page must never embed real numbers in its initial render once this plan lands (today it does). Task 5's tests assert the page's initial HTML/props carry no real report data regardless of query params.
- **The `createEvent`/`updateEvent` routes receive a `room_ids`/`menu_template_id` that doesn't belong to this venue** (an id copied from another venue, or a stale id after deletion) — the existing ownership checks inside `lib/venue/events.ts` must still fire from the new server call path exactly as they did from the browser path. Task 3's tests reuse the existing cross-venue-room test case.

---

### Task 1: Thread `isOwner` through the elevation chain

**Files:**
- Create: `supabase/migrations/0094_venue_manager_elevation_is_owner.sql`
- Modify: `lib/venue/manager-elevation.ts`
- Modify: `app/api/venue/managers/elevate/route.ts`
- Modify: `components/venue/shell/ManagerElevationContext.tsx`
- Test: `tests/supabase/venue_managers.test.ts` (extend), `tests/supabase/manager_elevation_lib.test.ts` (extend), `tests/components/venue/shell/ManagerElevationContext.test.tsx` (extend)

**Interfaces:**
- Consumes: `verify_venue_manager` RPC, `venue_managers.is_owner` column (both from Plan 1's migration `0090`).
- Produces: `verify_venue_manager` RPC now returns `is_owner boolean` as its third column (before `error_code`, so existing positional destructuring `data![0]` callers must read the new shape). `verifyVenueManager()` now resolves `{ managerId, managerName, isOwner }` on success. `createManagerElevation()` now takes a 4th arg `isOwner: boolean` and returns `{ token, expiresAt, managerName, isOwner }`. `validateManagerElevation()` now resolves `{ managerId, managerName, isOwner }` (looked up fresh from `venue_managers` at validation time, not copied from the token's creation time — so a later owner change is reflected immediately). `useManagerElevation()` now also exposes `isOwner: boolean`.

- [ ] **Step 1: Write the migration**

```sql
-- 0094: venue_managers managers' is_owner flag, threaded through
-- verify_venue_manager so callers (the elevate route, Поставки/Извештаи
-- gating) can tell an owner's elevation from a plain manager's without a
-- second round trip.

begin;

drop function public.verify_venue_manager(uuid, text, text);

create function public.verify_venue_manager(p_venue_id uuid, p_name text, p_password text)
returns table(manager_id uuid, manager_name text, is_owner boolean, error_code text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  mgr venue_managers%rowtype;
begin
  select * into mgr from venue_managers where venue_id = p_venue_id and name = p_name;
  if not found then
    perform extensions.crypt(p_password, '$2a$10$amopzlEf9bwgwGGHg6UB4.q/rWaHJe5KyNsVOImbMPY31VjPUGeW6');
    return query select null::uuid, null::text, null::boolean, 'invalid'::text;
    return;
  end if;

  if mgr.locked_until is not null and mgr.locked_until > now() then
    return query select null::uuid, null::text, null::boolean, 'locked'::text;
    return;
  end if;

  if mgr.password_hash = extensions.crypt(p_password, mgr.password_hash) then
    update venue_managers set failed_attempts = 0, locked_until = null where id = mgr.id;
    return query select mgr.id, mgr.name, mgr.is_owner, null::text;
  else
    update venue_managers
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
      where id = mgr.id;
    return query select null::uuid, null::text, null::boolean, 'invalid'::text;
  end if;
end;
$$;
revoke all on function public.verify_venue_manager(uuid, text, text) from public, anon, authenticated;
grant execute on function public.verify_venue_manager(uuid, text, text) to service_role;

commit;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up`
Expected: `{"applied":["/Users/.../supabase/migrations/0094_venue_manager_elevation_is_owner.sql"],"message":"Migrations applied"}`

- [ ] **Step 3: Update the failing tests first**

In `tests/supabase/venue_managers.test.ts`, the first test (`"creates a manager and verifies the correct password"`) currently asserts:
```typescript
expect(data![0]).toMatchObject({ manager_id: managerId, manager_name: "Марко", error_code: null });
```
Change it to:
```typescript
expect(data![0]).toMatchObject({ manager_id: managerId, manager_name: "Марко", is_owner: true, error_code: null });
```
(The manager created in that test is `p_is_owner: true` — see the `create_venue_manager` call right above it.)

In `tests/supabase/manager_elevation_lib.test.ts`, update both `verifyVenueManager` assertions and the `createManagerElevation`/`validateManagerElevation` assertions:
```typescript
it("resolves the manager on a correct password", async () => {
  const result = await verifyVenueManager(venueId, "Елена", "correct-password-1");
  expect(result).toEqual({ managerId, managerName: "Елена", isOwner: true }); // Елена was created with p_is_owner: true in beforeAll
});
```
```typescript
it("creates a token, validates it for the right venue, and rejects it for a different venue", async () => {
  const elevation = await createManagerElevation(venueId, managerId, "Елена", true);
  expect(elevation.token).toHaveLength(64);
  expect(elevation.managerName).toBe("Елена");
  expect(elevation.isOwner).toBe(true);

  const valid = await validateManagerElevation(elevation.token, venueId);
  expect(valid).toEqual({ managerId, managerName: "Елена", isOwner: true });

  const wrongVenue = await validateManagerElevation(elevation.token, otherVenueId);
  expect(wrongVenue).toBeNull();
});
```
Every other `createManagerElevation(venueId, managerId, "Елена")` call in that file (the "stores the token hashed", "rejects an expired token", "deletes a token" tests) needs the same 4th argument added: `createManagerElevation(venueId, managerId, "Елена", true)`.

Add one new test to the same file, right after the "rejects a token that was never issued" test:
```typescript
it("reflects a non-owner manager's isOwner as false", async () => {
  const staffId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Стефан", p_password: "staff-pass-123", p_is_owner: false })).data as string;
  const elevation = await createManagerElevation(venueId, staffId, "Стефан", false);
  const result = await validateManagerElevation(elevation.token, venueId);
  expect(result).toEqual({ managerId: staffId, managerName: "Стефан", isOwner: false });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:db -- tests/supabase/venue_managers.test.ts tests/supabase/manager_elevation_lib.test.ts`
Expected: FAIL — the lib functions don't return `isOwner` yet, so the `toEqual`/`toMatchObject` assertions mismatch.

- [ ] **Step 5: Update `lib/venue/manager-elevation.ts`**

```typescript
export type VerifyManagerResult =
  | { managerId: string; managerName: string; isOwner: boolean }
  | { errorCode: "invalid" | "locked" };

export async function verifyVenueManager(venueId: string, name: string, password: string): Promise<VerifyManagerResult> {
  const client = createServiceRoleClient();
  const { data, error } = await client.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: name, p_password: password });
  if (error) throw error;
  const row = data![0] as { manager_id: string | null; manager_name: string | null; is_owner: boolean | null; error_code: "invalid" | "locked" | null };
  if (row.error_code) return { errorCode: row.error_code };
  return { managerId: row.manager_id!, managerName: row.manager_name!, isOwner: row.is_owner! };
}

export async function createManagerElevation(
  venueId: string,
  managerId: string,
  managerName: string,
  isOwner: boolean
): Promise<{ token: string; expiresAt: Date; managerName: string; isOwner: boolean }> {
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
  return { token, expiresAt, managerName, isOwner };
}

export async function validateManagerElevation(token: string, venueId: string): Promise<{ managerId: string; managerName: string; isOwner: boolean } | null> {
  const client = createServiceRoleClient();
  const tokenHash = await hashSessionToken(token);
  const { data } = await client
    .from("venue_manager_elevations")
    .select("manager_id, manager_name, venue_id, expires_at, venue_managers(is_owner)")
    .eq("token", tokenHash)
    .maybeSingle();
  if (!data) return null;
  if (data.venue_id !== venueId) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  const managerRow = data.venue_managers as { is_owner: boolean } | { is_owner: boolean }[] | null;
  const isOwner = Array.isArray(managerRow) ? (managerRow[0]?.is_owner ?? false) : (managerRow?.is_owner ?? false);
  return { managerId: data.manager_id, managerName: data.manager_name, isOwner };
}
```
(`deleteManagerElevation` is unchanged.)

- [ ] **Step 6: Update the elevate route**

In `app/api/venue/managers/elevate/route.ts`, the success branch currently reads:
```typescript
const elevation = await createManagerElevation(venueId, result.managerId, result.managerName);
return NextResponse.json({ token: elevation.token, expiresAt: elevation.expiresAt.toISOString(), managerName: elevation.managerName });
```
Change to:
```typescript
const elevation = await createManagerElevation(venueId, result.managerId, result.managerName, result.isOwner);
return NextResponse.json({ token: elevation.token, expiresAt: elevation.expiresAt.toISOString(), managerName: elevation.managerName, isOwner: elevation.isOwner });
```

- [ ] **Step 7: Run the lib/route tests to verify they pass**

Run: `npm run test:db -- tests/supabase/venue_managers.test.ts tests/supabase/manager_elevation_lib.test.ts tests/supabase/manager_elevation_routes.test.ts`
Expected: PASS (the routes test's existing assertions don't check `isOwner`, so they keep passing unmodified — the response just carries an extra field)

- [ ] **Step 8: Update `ManagerElevationContext.tsx`**

```typescript
type ElevationState = { token: string; managerName: string; expiresAt: string; isOwner: boolean } | null;

type ManagerElevationValue = {
  managerName: string | null;
  isOwner: boolean;
  elevate: (name: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  deAuthorize: () => void;
  token: string | null;
};
```
In the provider body, the `elevate` callback's success branch currently does:
```typescript
setState({ token: data.token, managerName: data.managerName, expiresAt: data.expiresAt });
```
Change to:
```typescript
setState({ token: data.token, managerName: data.managerName, expiresAt: data.expiresAt, isOwner: Boolean(data.isOwner) });
```
And the returned context value currently is:
```typescript
<ManagerElevationContext.Provider value={{ managerName: state?.managerName ?? null, token: state?.token ?? null, elevate, deAuthorize }}>
```
Change to:
```typescript
<ManagerElevationContext.Provider value={{ managerName: state?.managerName ?? null, isOwner: state?.isOwner ?? false, token: state?.token ?? null, elevate, deAuthorize }}>
```

- [ ] **Step 9: Add a test for `isOwner` to `ManagerElevationContext.test.tsx`**

Add, right after the "elevates on success and reflects the manager's name" test:
```typescript
it("exposes isOwner from the elevation response", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: "abc123", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко", isOwner: true }) });
  function OwnerProbe() {
    const { isOwner, elevate } = useManagerElevation();
    return (
      <div>
        <p data-testid="owner">{String(isOwner)}</p>
        <button onClick={() => elevate("Марко", "pw-1")}>elevate</button>
      </div>
    );
  }
  render(<ManagerElevationProvider><OwnerProbe /></ManagerElevationProvider>);
  expect(screen.getByTestId("owner")).toHaveTextContent("false");
  fireEvent.click(screen.getByText("elevate"));
  await waitFor(() => expect(screen.getByTestId("owner")).toHaveTextContent("true"));
});
```

- [ ] **Step 10: Run the component test to verify it passes**

Run: `npx vitest run tests/components/venue/shell/ManagerElevationContext.test.tsx`
Expected: PASS, 5 tests

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/0094_venue_manager_elevation_is_owner.sql lib/venue/manager-elevation.ts app/api/venue/managers/elevate/route.ts components/venue/shell/ManagerElevationContext.tsx tests/supabase/venue_managers.test.ts tests/supabase/manager_elevation_lib.test.ts tests/components/venue/shell/ManagerElevationContext.test.tsx
git commit -m "feat: thread isOwner through the manager elevation chain"
```

---

### Task 2: `lib/venue/manager-guard.ts` — shared server-side gate

**Files:**
- Create: `lib/venue/manager-guard.ts`
- Test: `tests/supabase/manager_guard.test.ts`

**Interfaces:**
- Consumes: `validateManagerElevation` from Task 1's updated `lib/venue/manager-elevation.ts`.
- Produces:
  - `export const MANAGER_TOKEN_HEADER = "x-venue-manager-token"`
  - `export type ManagerGuardResult = { managerId: string; managerName: string; isOwner: boolean }`
  - `export async function requireManagerElevation(request: Request, venueId: string): Promise<ManagerGuardResult | null>` — null if the header is missing, or the token is invalid/expired/wrong-venue.
  - `export async function requireOwnerElevation(request: Request, venueId: string): Promise<ManagerGuardResult | null>` — null for all of the above, plus a valid non-owner manager.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/supabase/manager_guard.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { requireManagerElevation, requireOwnerElevation, MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";
import { createManagerElevation } from "@/lib/venue/manager-elevation";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let otherVenueId: string;
let ownerId: string;
let staffManagerId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Guard Venue ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Guard Other Venue ${stamp}` }).select("id").single()).data!.id;
  ownerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Власник", p_password: "owner-pass-123", p_is_owner: true })).data as string;
  staffManagerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "manager-pass-123", p_is_owner: false })).data as string;
});
afterAll(async () => {
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

function reqWithToken(token?: string) {
  const headers = new Headers();
  if (token) headers.set(MANAGER_TOKEN_HEADER, token);
  return new Request("http://localhost/api/venue/events", { headers });
}

describe("requireManagerElevation", () => {
  it("resolves for a valid manager token on the right venue", async () => {
    const elevation = await createManagerElevation(venueId, staffManagerId, "Менаџер", false);
    const result = await requireManagerElevation(reqWithToken(elevation.token), venueId);
    expect(result).toEqual({ managerId: staffManagerId, managerName: "Менаџер", isOwner: false });
  });

  it("returns null with no header at all", async () => {
    expect(await requireManagerElevation(reqWithToken(), venueId)).toBeNull();
  });

  it("returns null for a token issued for a different venue", async () => {
    const elevation = await createManagerElevation(venueId, staffManagerId, "Менаџер", false);
    expect(await requireManagerElevation(reqWithToken(elevation.token), otherVenueId)).toBeNull();
  });

  it("returns null for a token that was never issued", async () => {
    expect(await requireManagerElevation(reqWithToken("0".repeat(64)), venueId)).toBeNull();
  });
});

describe("requireOwnerElevation", () => {
  it("resolves for the owner's token", async () => {
    const elevation = await createManagerElevation(venueId, ownerId, "Власник", true);
    const result = await requireOwnerElevation(reqWithToken(elevation.token), venueId);
    expect(result).toEqual({ managerId: ownerId, managerName: "Власник", isOwner: true });
  });

  it("returns null for a valid non-owner manager's token", async () => {
    const elevation = await createManagerElevation(venueId, staffManagerId, "Менаџер", false);
    expect(await requireOwnerElevation(reqWithToken(elevation.token), venueId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:db -- tests/supabase/manager_guard.test.ts`
Expected: FAIL with "Cannot find module '@/lib/venue/manager-guard'"

- [ ] **Step 3: Write the implementation**

```typescript
// lib/venue/manager-guard.ts
import "server-only";
import { validateManagerElevation } from "@/lib/venue/manager-elevation";

export const MANAGER_TOKEN_HEADER = "x-venue-manager-token";

export type ManagerGuardResult = { managerId: string; managerName: string; isOwner: boolean };

/**
 * A manager-or-owner elevation for `venueId`, re-verified against the
 * database on every call (spec D2/§5) — never trust a client-asserted flag.
 * Null for a missing header, or a token that's invalid, expired, or belongs
 * to a different venue.
 */
export async function requireManagerElevation(request: Request, venueId: string): Promise<ManagerGuardResult | null> {
  const token = request.headers.get(MANAGER_TOKEN_HEADER);
  if (!token) return null;
  return validateManagerElevation(token, venueId);
}

/** Same as requireManagerElevation, but only the venue's one owner qualifies. */
export async function requireOwnerElevation(request: Request, venueId: string): Promise<ManagerGuardResult | null> {
  const result = await requireManagerElevation(request, venueId);
  return result?.isOwner ? result : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:db -- tests/supabase/manager_guard.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add lib/venue/manager-guard.ts tests/supabase/manager_guard.test.ts
git commit -m "feat: add lib/venue/manager-guard.ts (requireManagerElevation, requireOwnerElevation)"
```

---

### Task 3: Gate event create/edit/delete behind new API routes

**Files:**
- Modify: `lib/venue/events.ts` (add an optional `client` param to the five mutating exports)
- Create: `app/api/venue/events/route.ts` (POST — create)
- Create: `app/api/venue/events/[eventId]/route.ts` (PATCH — update, DELETE — delete)
- Create: `app/api/venue/events/[eventId]/contact/route.ts` (PATCH — contact info)
- Create: `app/api/venue/events/[eventId]/finance/route.ts` (PATCH — finance)
- Create: `lib/venue/events-client.ts` (browser-side fetch wrappers; no `server-only`)
- Modify: `lib/api/schemas.ts` (add the four new body schemas)
- Modify: `components/venue/NewEventForm.tsx`, `components/venue/dashboard/EventEditForm.tsx` (call the new client wrappers instead of `lib/venue/events.ts` directly)
- Test: `tests/supabase/venue_events_routes.test.ts`

**Interfaces:**
- Consumes: `requireManagerElevation` from Task 2; `getCurrentVenueId` from `lib/venue/current-venue.ts`; `createServerSupabaseClient` from `lib/supabase/server.ts`; `useManagerElevation` from `components/venue/shell/ManagerElevationContext.tsx` (Task 1's `token` field).
- Produces: `POST /api/venue/events` (body: `CreateEventInput` minus `venue_id`) → `201 { id: string }`. `PATCH /api/venue/events/[eventId]` (body: `UpdateEventInput`) → `200 { ok: true }`. `DELETE /api/venue/events/[eventId]` → `200 { ok: true }`. `PATCH /api/venue/events/[eventId]/contact` (body: `EventContactInfo`) → `200 { ok: true }`. `PATCH /api/venue/events/[eventId]/finance` (body: `EventFinanceInfo`) → `200 { ok: true }`. Every one of these is `403 { error }` without a valid manager-or-owner elevation.
- Produces (client wrappers in `lib/venue/events-client.ts`): `createEventViaApi(input: CreateEventInput, managerToken: string | null): Promise<{ id: string }>`, `updateEventViaApi(eventId: string, input: UpdateEventInput, managerToken: string | null): Promise<void>`, `deleteEventViaApi(eventId: string, managerToken: string | null): Promise<void>`, `updateEventContactInfoViaApi(eventId: string, input: EventContactInfo, managerToken: string | null): Promise<void>`, `updateEventFinanceViaApi(eventId: string, input: EventFinanceInfo, managerToken: string | null): Promise<void>` — each throws an `Error` with the server's `{ error }` message on a non-2xx response, matching how the old direct-Supabase calls threw on `{ error }`.

- [ ] **Step 1: Add a `client` param to the five mutating functions in `lib/venue/events.ts`**

Change each of `createEvent`, `updateEvent`, `deleteEvent`, `updateEventContactInfo`, `updateEventFinance` to take an optional trailing `client: SupabaseClient = resolveSupabaseClient()` and use `client` everywhere they currently call `resolveSupabaseClient()` inline. For example, `createEvent` goes from:
```typescript
export async function createEvent(input: CreateEventInput): Promise<{ id: string }> {
  const contacts = parseCoupleContacts(input.contacts);
  if (!contacts.ok) throw new Error(contacts.error);
  const supabase = resolveSupabaseClient();
  ...
```
to:
```typescript
export async function createEvent(input: CreateEventInput, client: SupabaseClient = resolveSupabaseClient()): Promise<{ id: string }> {
  const contacts = parseCoupleContacts(input.contacts);
  if (!contacts.ok) throw new Error(contacts.error);
  const supabase = client;
  ...
```
Apply the same pattern to the other four: `updateEvent(eventId, venueId, input, client = resolveSupabaseClient())`, `deleteEvent(eventId, client = resolveSupabaseClient())`, `updateEventContactInfo(eventId, input, client = resolveSupabaseClient())`, `updateEventFinance(eventId, input, client = resolveSupabaseClient())` — in each, replace the inline `resolveSupabaseClient()` call with the new `client` parameter. This is additive only: every existing call site (which passes no client) keeps working exactly as before until Step 6 rewires the two client components.

- [ ] **Step 2: Add the four request schemas**

In `lib/api/schemas.ts`, right after the manager elevation section (Plan 1's `managerDeauthorizeBody`):
```typescript
// ---------------------------------------------------------------------------
// Venue events (gated: manager or owner elevation required — Plan 2)

export const EVENT_INPUT_REQUIRED_ERROR = "Внесете ги задолжителните податоци за настанот.";
const eventStatus = z.enum(["preparation", "confirmed", "in_progress", "completed", "cancelled"]);
const eventType = z.enum(["wedding", "birthday", "baptism", "graduation", "corporate", "other"]);
const eventContactsShape = {
  contact_email: z.string().max(254).nullable().optional(),
  contact_email_2: z.string().max(254).nullable().optional(),
  contact_phone: z.string().max(50).nullable().optional(),
};

export const createEventBody = z.object(
  {
    couple_names: z.string({ error: EVENT_INPUT_REQUIRED_ERROR }).min(1).max(NAME_MAX),
    event_date: z.string({ error: EVENT_INPUT_REQUIRED_ERROR }).min(1),
    start_time: z.string().nullable().optional(),
    end_time: z.string().nullable().optional(),
    event_type: eventType.optional(),
    status: eventStatus.optional(),
    guest_count_estimate: z.number().int().min(0).nullable().optional(),
    room_ids: z.array(uuid).max(50),
    menu_template_id: uuid.nullable(),
    contacts: z.object(eventContactsShape),
  },
  { error: EVENT_INPUT_REQUIRED_ERROR },
);

export const updateEventBody = z.object(
  {
    couple_names: z.string({ error: EVENT_INPUT_REQUIRED_ERROR }).min(1).max(NAME_MAX),
    event_date: z.string({ error: EVENT_INPUT_REQUIRED_ERROR }).min(1),
    start_time: z.string().nullable(),
    end_time: z.string().nullable(),
    status: eventStatus,
    event_type: eventType,
    guest_count_estimate: z.number().int().min(0).nullable(),
    room_ids: z.array(uuid).max(50),
    menu_template_id: uuid.nullable(),
  },
  { error: EVENT_INPUT_REQUIRED_ERROR },
);

export const updateEventContactBody = z.object(eventContactsShape, { error: EVENT_INPUT_REQUIRED_ERROR });

export const updateEventFinanceBody = z.object(
  {
    total_price: z.number().min(0).max(1e12).nullable(),
    deposit_paid: z.number().min(0).max(1e12).nullable(),
  },
  { error: EVENT_INPUT_REQUIRED_ERROR },
);
```
(`uuid` is already defined earlier in this file — check its exact name with `grep -n "^export const uuid" lib/api/schemas.ts` before writing this step for real; use whatever that export is actually called.)

- [ ] **Step 3: Write the failing route tests**

```typescript
// tests/supabase/venue_events_routes.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let userId: string;
let managerToken: string;
let eventId: string;
const EMAIL = `events-route-${stamp}@test.local`;
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

import { POST as createRoute } from "@/app/api/venue/events/route";
import { PATCH as updateRoute, DELETE as deleteRoute } from "@/app/api/venue/events/[eventId]/route";
import { PATCH as contactRoute } from "@/app/api/venue/events/[eventId]/contact/route";
import { PATCH as financeRoute } from "@/app/api/venue/events/[eventId]/finance/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

function req(url: string, method: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return new NextRequest(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
function ctx(eventId: string) {
  return { params: Promise.resolve({ eventId }) };
}

const validCreateBody = {
  couple_names: "Тест Пар", event_date: "2027-01-01", room_ids: [], menu_template_id: null,
  contacts: { contact_email: "test@example.com", contact_phone: "070123456" },
};

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Events Route Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Тест Менаџер", p_password: "manager-pass-1", p_is_owner: true })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Тест Менаџер", true)).token;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Постоечки Пар", event_date: "2027-02-01" }).select("id").single()).data!.id;
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("POST /api/venue/events", () => {
  it("creates an event for an elevated manager", async () => {
    const res = await createRoute(req("/api/venue/events", "POST", validCreateBody, managerToken), ctx(""));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.id).toBe("string");
  });

  it("refuses with no manager token", async () => {
    const res = await createRoute(req("/api/venue/events", "POST", validCreateBody), ctx(""));
    expect(res.status).toBe(403);
  });

  it("refuses with an invalid manager token", async () => {
    const res = await createRoute(req("/api/venue/events", "POST", validCreateBody, "0".repeat(64)), ctx(""));
    expect(res.status).toBe(403);
  });
});

describe("PATCH/DELETE /api/venue/events/[eventId]", () => {
  it("updates an event for an elevated manager", async () => {
    const res = await updateRoute(
      req(`/api/venue/events/${eventId}`, "PATCH", {
        couple_names: "Изменет Пар", event_date: "2027-02-02", start_time: null, end_time: null,
        status: "confirmed", event_type: "wedding", guest_count_estimate: 50, room_ids: [], menu_template_id: null,
      }, managerToken),
      ctx(eventId),
    );
    expect(res.status).toBe(200);
  });

  it("refuses an update with no manager token", async () => {
    const res = await updateRoute(
      req(`/api/venue/events/${eventId}`, "PATCH", {
        couple_names: "X", event_date: "2027-02-02", start_time: null, end_time: null,
        status: "confirmed", event_type: "wedding", guest_count_estimate: null, room_ids: [], menu_template_id: null,
      }),
      ctx(eventId),
    );
    expect(res.status).toBe(403);
  });

  it("refuses a delete with no manager token", async () => {
    const res = await deleteRoute(req(`/api/venue/events/${eventId}`, "DELETE", undefined), ctx(eventId));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/venue/events/[eventId]/contact and /finance", () => {
  it("updates contact info for an elevated manager", async () => {
    const res = await contactRoute(
      req(`/api/venue/events/${eventId}/contact`, "PATCH", { contact_email: "new@example.com", contact_phone: "070999999", contact_email_2: null }, managerToken),
      ctx(eventId),
    );
    expect(res.status).toBe(200);
  });

  it("refuses finance update with no manager token", async () => {
    const res = await financeRoute(req(`/api/venue/events/${eventId}/finance`, "PATCH", { total_price: 1000, deposit_paid: 200 }), ctx(eventId));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:db -- tests/supabase/venue_events_routes.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/venue/events/route'"

- [ ] **Step 5: Write the four route files**

```typescript
// app/api/venue/events/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { createEvent } from "@/lib/venue/events";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { createEventBody } from "@/lib/api/schemas";

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";

export const POST = withPublic(
  async ({ request, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    try {
      const event = await createEvent({ ...body, venue_id: venueId }, supabase);
      return NextResponse.json(event);
    } catch (err) {
      return errorResponse(err, "Настанот не можеше да се зачува.", request);
    }
  },
  { invalidJsonError: "Invalid JSON body", body: createEventBody, invalidBodyError: "Неважечки податоци за настанот." },
);
```

```typescript
// app/api/venue/events/[eventId]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { updateEvent, deleteEvent } from "@/lib/venue/events";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { updateEventBody, uuid } from "@/lib/api/schemas";

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";
const paramsSchema = z.object({ eventId: uuid });

export const PATCH = withPublic(
  async ({ request, params, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    try {
      await updateEvent(params.eventId, venueId, body, supabase);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Настанот не можеше да се зачува.", request);
    }
  },
  { invalidJsonError: "Invalid JSON body", body: updateEventBody, params: paramsSchema, invalidBodyError: "Неважечки податоци за настанот." },
);

export const DELETE = withPublic(
  async ({ request, params }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    try {
      await deleteEvent(params.eventId, supabase);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Настанот не можеше да се избрише.", request);
    }
  },
  { params: paramsSchema },
);
```

```typescript
// app/api/venue/events/[eventId]/contact/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { updateEventContactInfo } from "@/lib/venue/events";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { updateEventContactBody, uuid } from "@/lib/api/schemas";

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";
const paramsSchema = z.object({ eventId: uuid });

export const PATCH = withPublic(
  async ({ request, params, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    try {
      await updateEventContactInfo(params.eventId, body, supabase);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Контактот не можеше да се зачува.", request);
    }
  },
  { invalidJsonError: "Invalid JSON body", body: updateEventContactBody, params: paramsSchema, invalidBodyError: "Неважечки контакт податоци." },
);
```

```typescript
// app/api/venue/events/[eventId]/finance/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { updateEventFinance } from "@/lib/venue/events";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { updateEventFinanceBody, uuid } from "@/lib/api/schemas";

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";
const paramsSchema = z.object({ eventId: uuid });

export const PATCH = withPublic(
  async ({ request, params, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    try {
      await updateEventFinance(params.eventId, body, supabase);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Финансиите не можеа да се зачуваат.", request);
    }
  },
  { invalidJsonError: "Invalid JSON body", body: updateEventFinanceBody, params: paramsSchema, invalidBodyError: "Неважечки финансиски податоци." },
);
```

- [ ] **Step 6: Run the route tests to verify they pass**

Run: `npm run test:db -- tests/supabase/venue_events_routes.test.ts`
Expected: PASS, 8 tests. If `uuid` isn't the real export name from `lib/api/schemas.ts`, fix the import name across all four route files and the test file to match.

- [ ] **Step 7: Write the browser-side fetch wrappers**

```typescript
// lib/venue/events-client.ts
//
// Browser-side counterparts to the gated functions in lib/venue/events.ts
// (createEvent, updateEvent, deleteEvent, updateEventContactInfo,
// updateEventFinance) — these call the new /api/venue/events routes instead
// of writing to Supabase directly, attaching the manager-elevation token so
// the server can independently verify it (spec D2). No "server-only": this
// file is imported from "use client" components.
import type { CreateEventInput, UpdateEventInput, EventContactInfo, EventFinanceInfo } from "@/lib/venue/events";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

async function post<T>(url: string, method: string, body: unknown, managerToken: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (managerToken) headers[MANAGER_TOKEN_HEADER] = managerToken;
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Акцијата не успеа.");
  return data as T;
}

export function createEventViaApi(input: CreateEventInput, managerToken: string | null): Promise<{ id: string }> {
  return post("/api/venue/events", "POST", input, managerToken);
}

export async function updateEventViaApi(eventId: string, input: UpdateEventInput, managerToken: string | null): Promise<void> {
  await post(`/api/venue/events/${eventId}`, "PATCH", input, managerToken);
}

export async function deleteEventViaApi(eventId: string, managerToken: string | null): Promise<void> {
  await post(`/api/venue/events/${eventId}`, "DELETE", undefined, managerToken);
}

export async function updateEventContactInfoViaApi(eventId: string, input: EventContactInfo, managerToken: string | null): Promise<void> {
  await post(`/api/venue/events/${eventId}/contact`, "PATCH", input, managerToken);
}

export async function updateEventFinanceViaApi(eventId: string, input: EventFinanceInfo, managerToken: string | null): Promise<void> {
  await post(`/api/venue/events/${eventId}/finance`, "PATCH", input, managerToken);
}
```

`lib/venue/manager-guard.ts` has `import "server-only"` (Task 2) — re-exporting `MANAGER_TOKEN_HEADER` from it into a client-importable file would pull that in. Move the constant instead: in `lib/venue/manager-guard.ts`, keep `MANAGER_TOKEN_HEADER` defined there (server code still imports it from there), and in `lib/venue/events-client.ts` above, redeclare the same literal locally instead of importing it:
```typescript
const MANAGER_TOKEN_HEADER = "x-venue-manager-token";
```
(A duplicated literal, not a shared import — the alternative, moving the constant to a third `server-only`-free file both sides import, is cleaner long-term but out of scope for this task; note it as a minor follow-up if you want, don't block on it.)

- [ ] **Step 8: Rewire `NewEventForm.tsx` and `EventEditForm.tsx`**

In `components/venue/NewEventForm.tsx`:
- Change the import from `createEvent, updateEventFinance, deleteEvent, findSameDayRoomEvents` out of `@/lib/venue/events` to: keep `findSameDayRoomEvents` from `@/lib/venue/events`, and add `import { createEventViaApi, updateEventFinanceViaApi, deleteEventViaApi } from "@/lib/venue/events-client";`.
- Add `import { useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";` and, inside the component, `const { token: managerToken } = useManagerElevation();`.
- Replace the three call sites (`createEvent(...)` → `createEventViaApi(..., managerToken)`, `updateEventFinance(...)` → `updateEventFinanceViaApi(..., managerToken)`, `deleteEvent(...)` → `deleteEventViaApi(..., managerToken)`), keeping every argument before `managerToken` identical to what's there today.

In `components/venue/dashboard/EventEditForm.tsx`:
- Same pattern: import `updateEventContactInfoViaApi, updateEventFinanceViaApi, updateEventViaApi, deleteEventViaApi` from `@/lib/venue/events-client` instead of `updateEventContactInfo, updateEventFinance, updateEvent, deleteEvent` from `@/lib/venue/events` (keep any other imports from that file, e.g. types, unchanged).
- Add the same `useManagerElevation()` call and pass `managerToken` as the trailing argument at all four call sites (`updateEventContactInfo` at line ~146, `updateEventFinance` at line ~166, `updateEvent` at line ~225, `deleteEvent` at line ~239 — read the file first, these line numbers are approximate and may have shifted).

- [ ] **Step 9: Run the existing component tests for these two forms to confirm nothing broke**

Run: `npx vitest run tests/components/venue/NewEventForm.test.tsx tests/components/venue/dashboard/EventEditForm.test.tsx`
Expected: FAIL at first — these tests currently mock `@/lib/venue/events`'s `createEvent`/`updateEvent`/`deleteEvent`/etc. directly; update each test file's `vi.mock("@/lib/venue/events", ...)` (or wherever it mocks these) to instead `vi.mock("@/lib/venue/events-client", ...)` with the same mock function shapes, and wrap the rendered component in `<ManagerElevationProvider>` (same pattern as `tests/components/venue/shell/AccountMenu.test.tsx`). Read both test files in full before editing — this step's exact diff depends on their current mock setup, which this plan hasn't inspected line-by-line; apply the systematic-debugging approach (read the actual failure, not a guess) if the mock swap doesn't make them pass cleanly.

Expected after fixing: PASS, same test count as before.

- [ ] **Step 10: Run the full suite for regressions**

Run: `npx tsc --noEmit -p . && npm run test:unit`
Expected: clean typecheck, all green.

- [ ] **Step 11: Commit**

```bash
git add lib/venue/events.ts lib/venue/events-client.ts lib/api/schemas.ts app/api/venue/events components/venue/NewEventForm.tsx components/venue/dashboard/EventEditForm.tsx tests/supabase/venue_events_routes.test.ts tests/components/venue/NewEventForm.test.tsx tests/components/venue/dashboard/EventEditForm.test.tsx
git commit -m "feat: gate event create/edit/delete behind manager-elevation-checked API routes"
```

---

### Task 4: Поставки — owner-only visibility, owner check on export/delete-account

**Files:**
- Modify: `components/venue/dashboard/SettingsClient.tsx`
- Modify: `app/api/venue/privacy/export/route.ts`
- Modify: `app/api/venue/privacy/delete-account/route.ts`
- Test: `tests/components/venue/dashboard/SettingsClient.test.tsx` (extend or create), `tests/supabase/privacy_routes_owner_gate.test.ts`

**Interfaces:**
- Consumes: `useManagerElevation()` (Task 1's `isOwner`); `requireOwnerElevation` from Task 2.
- Produces: `SettingsClient` renders its real content only when `isOwner` is true; otherwise an inline "Оваа страница е достапна само за сопственикот." message. The export and delete-account routes 403 for a non-owner (missing token, non-owner manager, or plain staff with no elevation at all).

**Note on scope:** this task does not move the profile/branding/floor-plan-lock-password writes behind new routes — see this plan's Global Constraints "Documented gap" entry. `currentStaff()` in `lib/privacy/staff.ts` stays the primary identity check for these two routes; this task adds the owner-elevation check *in addition* to it, it doesn't replace it.

- [ ] **Step 1: Write the failing component test**

In `tests/components/venue/dashboard/SettingsClient.test.tsx` (read the file first — it may already exist with other tests; add to it rather than replacing), add:
```typescript
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";
// ... existing imports

describe("SettingsClient — owner-only gate", () => {
  it("shows an owner-only message instead of the settings content when not elevated as owner", () => {
    render(
      <ManagerElevationProvider>
        <SettingsClient venueId="v1" venueName="Sala Biser" email="owner@example.com" />
      </ManagerElevationProvider>
    );
    expect(screen.getByText("Оваа страница е достапна само за сопственикот.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/внесете го името на локалот/i)).not.toBeInTheDocument();
  });
});
```
(If the existing test file's other tests render `<SettingsClient .../>` without a `ManagerElevationProvider` wrapper, those will now fail too, since `useManagerElevation()` throws outside a provider — Step 4 below fixes that by making the gate check tolerant, or Step 1 should instead update every existing render call in this file to wrap with `<ManagerElevationProvider>`. Do the wrap, not a tolerant check: the provider is cheap to add and keeps `useManagerElevation()`'s contract (throws outside a provider) intact everywhere else in the codebase.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/venue/dashboard/SettingsClient.test.tsx`
Expected: FAIL — the owner-only message doesn't exist yet (and, if other tests in the file aren't yet wrapped in the provider, they fail too — wrap them now as part of this step, not later).

- [ ] **Step 3: Add the gate to `SettingsClient.tsx`**

Near the top of the component function, add:
```typescript
import { useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";
```
Inside the component body, right after the existing hooks:
```typescript
const { isOwner } = useManagerElevation();
```
Wrap the component's existing `return (...)` JSX: rename it to a local variable or wrap with an early return. The simplest change — right before the existing `return (` — add:
```typescript
if (!isOwner) {
  return (
    <div className="wrap">
      <p className="muted" style={{ padding: 24 }}>Оваа страница е достапна само за сопственикот.</p>
    </div>
  );
}
```
(Match the existing wrapping `<div className="wrap">` class from the component's real return so the owner-only message inherits the same page padding/layout — check the actual existing return's outermost element before writing this and use its exact class name.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/venue/dashboard/SettingsClient.test.tsx`
Expected: PASS, all tests in the file (existing + new)

- [ ] **Step 5: Write the failing route tests for the owner gate**

```typescript
// tests/supabase/privacy_routes_owner_gate.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let userId: string;
let ownerToken: string;
let managerToken: string;
const EMAIL = `privacy-owner-gate-${stamp}@test.local`;
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

import { GET as exportRoute } from "@/app/api/venue/privacy/export/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Privacy Gate Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  const ownerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Власник", p_password: "owner-pass-123", p_is_owner: true })).data as string;
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "manager-pass-123", p_is_owner: false })).data as string;
  ownerToken = (await createManagerElevation(venueId, ownerId, "Власник", true)).token;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер", false)).token;
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

function req(token?: string) {
  const headers = new Headers();
  if (token) headers.set(MANAGER_TOKEN_HEADER, token);
  return new NextRequest("http://localhost/api/venue/privacy/export", { headers });
}

describe("GET /api/venue/privacy/export — owner gate", () => {
  it("succeeds for the owner's token", async () => {
    const res = await exportRoute(req(ownerToken));
    expect(res.status).toBe(200);
  });

  it("refuses a non-owner manager's token", async () => {
    const res = await exportRoute(req(managerToken));
    expect(res.status).toBe(403);
  });

  it("refuses with no token at all", async () => {
    const res = await exportRoute(req());
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm run test:db -- tests/supabase/privacy_routes_owner_gate.test.ts`
Expected: FAIL — the export route currently answers 200 for any staff member regardless of elevation.

- [ ] **Step 7: Add the owner check to both routes**

In `app/api/venue/privacy/export/route.ts`, after the existing `currentStaff()` check:
```typescript
const staff = await currentStaff();
if (!staff) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
```
add:
```typescript
const owner = await requireOwnerElevation(request, staff.venueId);
if (!owner) return NextResponse.json({ error: "Потребна е најава како сопственик." }, { status: 403 });
```
with the new import `import { requireOwnerElevation } from "@/lib/venue/manager-guard";` added at the top.

In `app/api/venue/privacy/delete-account/route.ts`, same pattern right after:
```typescript
const staff = await currentStaff();
if (!staff) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
```
add:
```typescript
const owner = await requireOwnerElevation(request, staff.venueId);
if (!owner) return NextResponse.json({ error: "Потребна е најава како сопственик." }, { status: 403 });
```
(same new import).

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test:db -- tests/supabase/privacy_routes_owner_gate.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 9: Update `SettingsClient.tsx`'s export/delete-account calls to send the token**

Both `handleExport` and `handleDeleteAccount` in `SettingsClient.tsx` currently `fetch(...)` with no manager-token header. Add `const { token: managerToken, isOwner } = useManagerElevation();` (already added in Step 3 for `isOwner` — extend the same destructure to also pull `token`), and in both fetch calls add a `headers` entry:
```typescript
headers: managerToken ? { "x-venue-manager-token": managerToken } : undefined,
```
(`handleExport`'s current call has no `headers` object at all — add one; `handleDeleteAccount`'s current call already sets `"content-type": "application/json"` — add the manager-token header alongside it in the same object.)

- [ ] **Step 10: Run the full existing privacy/settings test suites for regressions**

Run: `npx vitest run tests/components/venue/dashboard/PrivacyActions.test.tsx tests/components/venue/dashboard/SettingsClient.test.tsx`
Expected: PASS. If `PrivacyActions.test.tsx`'s existing export/delete-account tests fail because they now expect an elevated owner and the test doesn't wrap in a `ManagerElevationProvider` with an elevated state, wrap those specific tests the same way `AccountMenu.test.tsx` wraps `renderMenu()` — read the file first; this is a mechanical fix, not a design change.

- [ ] **Step 11: Commit**

```bash
git add components/venue/dashboard/SettingsClient.tsx app/api/venue/privacy/export/route.ts app/api/venue/privacy/delete-account/route.ts tests/components/venue/dashboard/SettingsClient.test.tsx tests/components/venue/dashboard/PrivacyActions.test.tsx tests/supabase/privacy_routes_owner_gate.test.ts
git commit -m "feat: gate Settings page visibility and export/delete-account routes to the venue owner"
```

---

### Task 5: Извештаи — gate real report data behind a manager/owner-checked route

**Files:**
- Create: `app/api/venue/reports/route.ts`
- Modify: `app/venue/reports/page.tsx` (stop embedding real data; render a client-fetching shell)
- Modify: `components/venue/dashboard/ReportsClient.tsx` (fetch its own data client-side, gated)
- Test: `tests/supabase/venue_reports_route.test.ts`, `tests/components/venue/dashboard/ReportsClient.test.tsx` (extend)

**Interfaces:**
- Consumes: `requireManagerElevation` from Task 2; `getReport`/`listRooms` from `lib/venue/reports.ts`/`lib/venue/rooms.ts` (unchanged); `useManagerElevation()`.
- Produces: `GET /api/venue/reports?from=&to=&room=` → `200 ReportData` for a valid manager-or-owner elevation, `403 { error }` otherwise. `ReportsPage` (server component) no longer calls `getReport` at all — it only resolves `venueId`, the feature flag, and the room list, and renders `<ReportsClient>` with no `report` prop; `ReportsClient` fetches its own data client-side on mount (and whenever its filters change), attaching the token from `useManagerElevation()`.

- [ ] **Step 1: Read `components/venue/dashboard/ReportsClient.tsx` and `app/venue/reports/page.tsx` in full before changing them**

This task restructures how `ReportsClient` gets its data (prop → self-fetch), so read both files completely first — this plan's summary of `ReportsPage` (above, from the architecture research) is accurate as of planning time but the exact prop names and the locked-feature `SAMPLE_REPORT` branch's wiring must be re-confirmed against the live file before editing.

- [ ] **Step 2: Write the failing route test**

```typescript
// tests/supabase/venue_reports_route.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let userId: string;
let managerToken: string;
const EMAIL = `reports-route-${stamp}@test.local`;
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

import { GET as reportsRoute } from "@/app/api/venue/reports/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Reports Route Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "manager-pass-123", p_is_owner: false })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер", false)).token;
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

function req(token?: string) {
  const headers = new Headers();
  if (token) headers.set(MANAGER_TOKEN_HEADER, token);
  return new NextRequest("http://localhost/api/venue/reports", { headers });
}

describe("GET /api/venue/reports", () => {
  it("returns report data for an elevated manager", async () => {
    const res = await reportsRoute(req(managerToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals).toBeDefined();
  });

  it("refuses with no manager token", async () => {
    const res = await reportsRoute(req());
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:db -- tests/supabase/venue_reports_route.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/venue/reports/route'"

- [ ] **Step 4: Write the route**

```typescript
// app/api/venue/reports/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getReport } from "@/lib/venue/reports";
import { listRooms } from "@/lib/venue/rooms";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, withRequestLog } from "@/lib/api/handler";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  return withRequestLog(request, async () => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: "Потребна е најава како менаџер." }, { status: 403 });

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const room = url.searchParams.get("room");
    const rooms = await listRooms(venueId, supabase);
    const roomId = rooms.some((r) => r.id === room) ? room! : undefined;
    const report = await getReport(supabase, venueId, {
      from: from && ISO.test(from) ? from : undefined,
      to: to && ISO.test(to) ? to : undefined,
      roomId,
    });
    return NextResponse.json(report);
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:db -- tests/supabase/venue_reports_route.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 6: Strip real data out of `ReportsPage` and make `ReportsClient` self-fetch**

In `app/venue/reports/page.tsx`, remove the `getReport` call and the `report` prop entirely — the page still resolves `venueId`, the `features.reports.enabled` flag (keep the existing `SAMPLE_REPORT` branch exactly as-is, since an un-entitled venue should see fabricated numbers regardless of elevation, same as today), and the room list, but passes no real `report` prop:
```typescript
if (!(await getVenueFeatures(venueId)).reports.enabled) {
  return <ReportsClient report={SAMPLE_REPORT} rooms={[]} filters={{ from, to }} />;
}
const rooms = await listRooms(venueId, supabase);
const roomId = rooms.some((r) => r.id === params.room) ? params.room : undefined;
return <ReportsClient rooms={rooms.map((r) => ({ id: r.id, name: r.name }))} filters={{ from, to, roomId }} />;
```
(The entitled branch no longer calls `getReport` at all — delete that import if nothing else in the file uses it.)

In `components/venue/dashboard/ReportsClient.tsx`, change its props type so `report` is optional (`report?: ReportData`), add `"use client"` imports for `useEffect`/`useState` and `useManagerElevation`, and at the top of the component:
```typescript
const { token: managerToken } = useManagerElevation();
const [report, setReport] = useState<ReportData | null>(initialReport ?? null);
const [reportError, setReportError] = useState<string | null>(null);

useEffect(() => {
  if (initialReport) return; // sample-report (locked-feature) branch already has its data
  if (!managerToken) {
    setReport(null);
    return;
  }
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.roomId) params.set("room", filters.roomId);
  fetch(`/api/venue/reports?${params.toString()}`, { headers: { "x-venue-manager-token": managerToken } })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setReportError(body?.error ?? "Извештајот не можеше да се вчита.");
        return;
      }
      setReport(await res.json());
      setReportError(null);
    })
    .catch(() => setReportError("Извештајот не можеше да се вчита."));
}, [managerToken, filters.from, filters.to, filters.roomId, initialReport]);

if (!managerToken && !initialReport) {
  return <p className="muted" style={{ padding: 24 }}>Извештаите се достапни само за менаџери.</p>;
}
if (reportError) {
  return <p role="alert" style={{ padding: 24 }}>{reportError}</p>;
}
if (!report) {
  return <p className="muted" style={{ padding: 24 }}>Се вчитува...</p>;
}
```
(`initialReport` here is the renamed `report` prop — rename the destructured prop at the top of the component from `report` to `initialReport` to avoid shadowing the new local `report` state; update every other reference to the prop inside the component accordingly. Read the rest of the component's body before this rename to find every such reference.)

- [ ] **Step 7: Update/add `ReportsClient` tests for the new self-fetch behavior**

Read the existing `tests/components/venue/dashboard/ReportsClient.test.tsx` (if present) and update any test that rendered `<ReportsClient report={...} .../>` expecting immediate real content — those now need either `initialReport` passed (sample-report/locked-feature case, unaffected) or a mocked `fetch` + `ManagerElevationProvider` with an already-elevated state (real-data case). Add:
```typescript
it("shows an owner/manager-only message when not elevated", () => {
  render(
    <ManagerElevationProvider>
      <ReportsClient rooms={[]} filters={{}} />
    </ManagerElevationProvider>
  );
  expect(screen.getByText("Извештаите се достапни само за менаџери.")).toBeInTheDocument();
});
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/components/venue/dashboard/ReportsClient.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add app/api/venue/reports/route.ts app/venue/reports/page.tsx components/venue/dashboard/ReportsClient.tsx tests/supabase/venue_reports_route.test.ts tests/components/venue/dashboard/ReportsClient.test.tsx
git commit -m "feat: gate real report data behind a manager-elevation-checked route"
```

---

### Task 6: Final verification

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no output (clean)

- [ ] **Step 2: Full unit suite**

Run: `npm run test:unit`
Expected: all green, no regressions

- [ ] **Step 3: Full live-DB suite**

Run: `npm run test:db`
Expected: all green (rerun once if a failure looks like known parallel-test-pollution flakiness in unrelated files before treating it as a real regression)

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: succeeds; confirm `/api/venue/events`, `/api/venue/events/[eventId]`, `/api/venue/events/[eventId]/contact`, `/api/venue/events/[eventId]/finance`, `/api/venue/reports` all appear in the route list

- [ ] **Step 5: Manual smoke check (not automatable — do this yourself before calling the plan done)**

As a plain staff session (no manager elevation): confirm "New Event" / event edit / event delete all now fail with a clear message instead of silently writing. Elevate as a non-owner manager: confirm events work, Поставки shows the owner-only message, Извештаи shows real data. Elevate as the owner: confirm everything works, including Поставки and export/delete-account.

- [ ] **Step 6: Commit any final fixups**

```bash
git add -A
git commit -m "chore: final verification pass for venue manager gating (Plan 2)"
```
(Skip this commit if Steps 1–4 needed no changes.)
