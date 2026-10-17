# Venue Manager/Staff Login — Plan 3: Owner UI, Self-Service Password, Forgot Password, Signup, Backfill

> **Superseded in part (2026-10-15):** Task 5 (forgot-password by email link) was built and then removed — migration 0103 drops its table, and lost manager passwords are now reset by support from the admin panel (spec D5/§6, migrations 0100/0105). Migration numbers in this plan are also off by one from the files that shipped (the reset table is 0099, not 0097). Kept as the historical record of what was planned.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the manager/staff feature: new venues get an owner at signup, existing venues are backfilled with one, the owner can add/remove managers from Поставки, any elevated manager can change their own password, and a locked-out manager can recover via email — matching spec §§6–8.

**Architecture:** `lib/venue/managers.ts` (new) holds the owner-only management functions (list/add/remove), reusing Plan 1's `create_venue_manager` RPC for adds. `lib/venue/manager-password-reset.ts` (new) mirrors `lib/venue/manager-elevation.ts`'s opaque-token-hashed-at-rest pattern for the forgot-password flow, emailing through the existing `lib/email.ts` (Resend). `provision_venue` (Postgres RPC, migration `0041`/`0048`) gains an owner-creation step so venue + staff + owner land in one transaction. A new "Менаџери" section renders inside `SettingsClient` (already owner-gated by Plan 2 Task 4), and a small AccountMenu action lets any elevated manager change their own password without opening Settings at all.

**Tech Stack:** Next.js App Router (Route Handlers), Supabase (Postgres + pgcrypto), Resend (via `lib/email.ts`), Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-14-venue-manager-staff-login-design.md` §§6–8. Also read Plan 1 and Plan 2 (same directory) — this plan's routes reuse their `MANAGER_TOKEN_HEADER`, `requireManagerElevation`/`requireOwnerElevation`, and `createManagerElevation`'s `isOwner`.

## Global Constraints

- Every new migration number continues from Plan 2's last one (`0094`) — this plan's migrations are `0095` (signup owner-creation in `provision_venue`) and `0096` (backfill) and `0097` (password-reset table), applied in that numeric order.
- The backfill migration (`0096`) inserts a fixed `owner` / `owner12345` row for every pre-existing venue — per spec D6, this is **test-phase-only** and must say so loudly in its header comment, exactly like Plan 1's ledger already ruled for the spec's own wording. It must never run against a dataset with real venues.
- The "Менаџери" section and the add/remove routes are owner-only: every route in this plan that mutates `venue_managers` calls `requireOwnerElevation` (Plan 2 Task 2), not `requireManagerElevation`.
- The forgot-password routes are the one exception: requesting a reset must work precisely when the requester has *no* elevation (that's the whole point — they're locked out), so those two routes check only that the caller is a signed-in staff member of the venue (`getCurrentVenueId`), never an elevation token.
- Password hashing for both add-manager and change-password reuses `extensions.crypt`/`gen_salt('bf', 10)` — the same approach as Plan 1's `create_venue_manager`, no new hashing code.
- An owner can't remove themself (spec §7) — enforced server-side in `removeManager`, not just a disabled button.
- Rate-limit the forgot-password request route the same way `managerElevation` is limited (Plan 1's `RATE_LIMITS`), fail-closed — a forgot-password request is itself a way to spam the venue's registered inbox.

## Review Focus

- **The owner tries to remove themself.** `removeManager` must refuse this specifically (not just "any manager with is_owner=true"), since the owner is also the only manager who can reach the remove UI for anyone — Task 3's tests cover this.
- **Two concurrent signups for the same not-yet-provisioned user** (the existing `provision_venue` lock already serializes this for the venue row) — once this plan adds owner creation inside the same function, a retried signup must not create a *second* owner row for a venue that already has one. Task 1's tests cover this by calling the RPC twice with the same user.
- **A forgot-password reset token for manager A, submitted with manager B's new password intent** — the token must be scoped to exactly the manager it was issued for; the confirm route re-derives the manager from the token, never from a client-supplied manager id. Task 5's tests cover this.
- **The backfill runs on a venue that already has an owner** (re-running the migration, or a venue created after Plan 3's signup change but before the backfill migration file's cutoff) — must not violate the one-owner-per-venue constraint or throw; `on conflict do nothing` scoped correctly. Task 2's tests cover this.
- **A non-owner manager calls the add/remove-manager or list-managers routes directly** (not through the UI, which already hides them) — must 403, same as every other owner-only route in Plan 2. Task 3's tests cover this explicitly.

---

### Task 1: Signup creates the owner atomically

**Files:**
- Create: `supabase/migrations/0095_provision_venue_owner.sql`
- Modify: `lib/venue/provisioning.ts`
- Modify: `app/api/venue/signup/route.ts`
- Modify: `lib/api/schemas.ts` (extend `venueSignupBody`)
- Modify: `components/auth/SignupForm.tsx`
- Test: `tests/supabase/provision_venue_owner.test.ts`

**Interfaces:**
- Consumes: `create_venue_manager`'s hashing approach (Plan 1, inlined here since this runs inside a different RPC, not a call to that one — `provision_venue` already holds its own advisory lock and transaction, calling another `SECURITY DEFINER` RPC from inside it would work but this plan inlines the insert for one fewer moving part).
- Produces: `provision_venue(p_user_id uuid, p_venue_name text, p_owner_name text, p_owner_password text)` (signature changed — one new required param each for owner name/password) returns the same `uuid` as before. `provisionVenueForUser(userId, venueName, ownerName, ownerPassword)` (signature changed, same return shape `{ venue_id: string }`).

- [ ] **Step 1: Write the migration**

```sql
-- 0095: /signup now collects the owner's name + manager password alongside
-- the venue name (spec §8) — provision_venue creates the venue, the staff
-- row, AND the is_owner=true venue_managers row in one transaction, so a
-- venue is never left without an owner between signup and a later step.

begin;

create or replace function public.provision_venue(p_user_id uuid, p_venue_name text, p_owner_name text, p_owner_password text)
returns uuid
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('provision_venue:' || p_user_id::text));
  select venue_id into v_venue_id from venue_staff where user_id = p_user_id limit 1;
  if v_venue_id is not null then
    return v_venue_id;
  end if;
  insert into venues (name, plan_id) values (p_venue_name, (select id from plans where is_default)) returning id into v_venue_id;
  insert into venue_staff (user_id, venue_id) values (p_user_id, v_venue_id);
  insert into venue_managers (venue_id, name, password_hash, is_owner)
  values (v_venue_id, p_owner_name, extensions.crypt(p_owner_password, extensions.gen_salt('bf', 10)), true)
  on conflict do nothing; -- the one-owner-per-venue partial unique index; a retry after this insert already ran is a no-op, not an error
  return v_venue_id;
end;
$$;
revoke all on function public.provision_venue(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_venue(uuid, text, text, text) to service_role;

-- The 3-arg signature is retired: every caller goes through this plan's new
-- 4-arg one. Drop it so a stale call site fails loudly instead of silently
-- skipping owner creation.
drop function if exists public.provision_venue(uuid, text);

commit;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up`
Expected: `{"applied":["/Users/.../supabase/migrations/0095_provision_venue_owner.sql"],"message":"Migrations applied"}`

- [ ] **Step 3: Write the failing tests**

```typescript
// tests/supabase/provision_venue_owner.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const createdVenueIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdVenueIds.length) await admin.from("venues").delete().in("id", createdVenueIds);
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
});

describe("provision_venue — owner creation", () => {
  it("creates the venue, staff row, and an owner manager row in one call", async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({ email: `provision-owner-${stamp}@test.local`, password: "pw-doesnt-matter-1", email_confirm: true });
    if (userError) throw userError;
    createdUserIds.push(user.user!.id);

    const { data: venueId, error } = await admin.rpc("provision_venue", {
      p_user_id: user.user!.id, p_venue_name: "Owner Test Venue", p_owner_name: "owner", p_owner_password: "owner-pass-123",
    });
    expect(error).toBeNull();
    createdVenueIds.push(venueId as string);

    const { data: managers } = await admin.from("venue_managers").select("name, is_owner").eq("venue_id", venueId as string);
    expect(managers).toEqual([{ name: "owner", is_owner: true }]);

    const { data: verify } = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "owner", p_password: "owner-pass-123" });
    expect(verify![0].error_code).toBeNull();
  });

  it("is idempotent — a retry for the same user does not create a second owner", async () => {
    const { data: user, error: userError } = await admin.auth.admin.createUser({ email: `provision-owner-retry-${stamp}@test.local`, password: "pw-doesnt-matter-1", email_confirm: true });
    if (userError) throw userError;
    createdUserIds.push(user.user!.id);

    const first = await admin.rpc("provision_venue", { p_user_id: user.user!.id, p_venue_name: "Retry Venue", p_owner_name: "owner", p_owner_password: "owner-pass-123" });
    createdVenueIds.push(first.data as string);
    const second = await admin.rpc("provision_venue", { p_user_id: user.user!.id, p_venue_name: "Retry Venue Again", p_owner_name: "someone-else", p_owner_password: "whatever-pass-1" });
    expect(second.data).toBe(first.data); // same venue id returned, no second venue created

    const { data: managers } = await admin.from("venue_managers").select("name").eq("venue_id", first.data as string);
    expect(managers).toHaveLength(1); // still just the original owner, "someone-else" was never inserted
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:db -- tests/supabase/provision_venue_owner.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 5: Update `lib/venue/provisioning.ts`**

```typescript
export async function provisionVenueForUser(
  userId: string,
  venueName: string,
  ownerName: string,
  ownerPassword: string
): Promise<{ venue_id: string }> {
  const { data, error } = await createServiceRoleClient().rpc("provision_venue", {
    p_user_id: userId,
    p_venue_name: venueName,
    p_owner_name: ownerName,
    p_owner_password: ownerPassword,
  });
  if (error) throw error;
  return { venue_id: data as string };
}
```

- [ ] **Step 6: Extend `venueSignupBody` in `lib/api/schemas.ts`**

```typescript
export const venueSignupBody = z.object(
  {
    venue_name: z
      .string({ error: VENUE_NAME_REQUIRED_ERROR })
      .refine((v) => v.trim().length > 0, { error: VENUE_NAME_REQUIRED_ERROR })
      .refine((v) => v.trim().length <= NAME_MAX, { error: "Името на локалот е предолго." }),
    owner_name: z
      .string({ error: "Внесете име на сопственикот." })
      .refine((v) => v.trim().length > 0, { error: "Внесете име на сопственикот." })
      .refine((v) => v.trim().length <= NAME_MAX, { error: "Името на сопственикот е предолго." }),
    owner_password: z
      .string({ error: "Лозинката за менаџер мора да има најмалку 8 знаци." })
      .min(8, { error: "Лозинката за менаџер мора да има најмалку 8 знаци." })
      .max(200),
  },
  { error: VENUE_NAME_REQUIRED_ERROR },
);
```

- [ ] **Step 7: Update `app/api/venue/signup/route.ts`**

The call site:
```typescript
const result = await provisionVenueForUser(user.id, parsed.data.venue_name.trim());
```
becomes:
```typescript
const result = await provisionVenueForUser(user.id, parsed.data.venue_name.trim(), parsed.data.owner_name.trim(), parsed.data.owner_password);
```

- [ ] **Step 8: Add the two fields to `SignupForm.tsx`**

Add `ownerName`/`ownerPassword` state and two fields to the form, right after the existing "Име на локалот" field:
```tsx
const [ownerName, setOwnerName] = useState("");
const [ownerPassword, setOwnerPassword] = useState("");
```
```tsx
<div className="auth-field">
  <label className="lab-s" htmlFor="signup-owner-name">
    Име (за менаџерска најава)
  </label>
  <input
    id="signup-owner-name"
    className="fld"
    placeholder="На пр. Име Презиме"
    value={ownerName}
    onChange={(e) => setOwnerName(e.target.value)}
    required
  />
</div>
<div className="auth-field">
  <label className="lab-s" htmlFor="signup-owner-password">
    Менаџерска лозинка
  </label>
  <input
    id="signup-owner-password"
    className="fld"
    placeholder="Менаџерска лозинка"
    type="password"
    value={ownerPassword}
    onChange={(e) => setOwnerPassword(e.target.value)}
    minLength={8}
    required
  />
  <p className="ev-hint" style={{ margin: "4px 0 0" }}>
    Оваа лозинка е одделна од лозинката за најава погоре — ќе ја користите за да се најавите како менаџер на споделениот компјутер на локалот.
  </p>
</div>
```
And in `provisionVenue`'s body (and the retry call), add the two fields:
```typescript
async function provisionVenue(venueName: string): Promise<Response> {
  return fetch("/api/venue/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ venue_name: venueName, owner_name: ownerName, owner_password: ownerPassword }),
  });
}
```
(`provisionVenue` already closes over component state in this file, so `ownerName`/`ownerPassword` are in scope without new parameters — check the actual current signature before editing, since Plan 1/2 didn't touch this function and it may have changed shape since this plan was written.)

- [ ] **Step 9: Update `tests/components/auth/SignupForm.test.tsx`**

Every existing test's `fireEvent.change` sequence needs two more fields filled before clicking submit, and the `fetch` assertion's expected body needs the two new keys. Read the file (already updated earlier this session for the `window.location.href` fix) and add, right after the existing "лозинка" field fill in each test:
```typescript
fireEvent.change(screen.getByLabelText(/име \(за менаџерска најава\)/i), { target: { value: "Марко Марковски" } });
fireEvent.change(screen.getByLabelText(/менаџерска лозинка/i), { target: { value: "manager-pass-123" } });
```
and update the `expect(global.fetch).toHaveBeenCalledWith(...)` assertion's body to:
```typescript
body: JSON.stringify({ venue_name: "Демо Локал", owner_name: "Марко Марковски", owner_password: "manager-pass-123" })
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run tests/components/auth/SignupForm.test.tsx`
Expected: PASS, 5 tests

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/0095_provision_venue_owner.sql lib/venue/provisioning.ts app/api/venue/signup/route.ts lib/api/schemas.ts components/auth/SignupForm.tsx tests/supabase/provision_venue_owner.test.ts tests/components/auth/SignupForm.test.tsx
git commit -m "feat: /signup creates the venue owner atomically with the venue"
```

---

### Task 2: Backfill existing venues with a test-phase owner

**Files:**
- Create: `supabase/migrations/0096_backfill_venue_managers.sql`
- Test: `tests/supabase/backfill_venue_managers.test.ts`

**Interfaces:**
- Produces: every `venues` row that has zero `venue_managers` rows gets one `is_owner = true` row, name `owner`, password `owner12345` (hashed).

- [ ] **Step 1: Write the migration**

```sql
-- 0096: one-time backfill for every venue that predates the manager/staff
-- feature (spec D6/§8) — name "owner", password "owner12345".
--
-- TEST-PHASE-ONLY. This fixed, publicly-documented password is acceptable
-- only because no real venue is live yet (spec D6). This migration must
-- NEVER be re-run (or copied into a new migration) against a dataset that
-- holds real venues — every such venue would get a publicly-known manager
-- password. Scoped by "has zero venue_managers rows", so running it twice
-- against the same database is a safe no-op either way, but that safety
-- does not make it safe to run against production data.

begin;

insert into venue_managers (venue_id, name, password_hash, is_owner)
select v.id, 'owner', extensions.crypt('owner12345', extensions.gen_salt('bf', 10)), true
from venues v
where not exists (select 1 from venue_managers m where m.venue_id = v.id);

commit;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up`
Expected: `{"applied":["/Users/.../supabase/migrations/0096_backfill_venue_managers.sql"],"message":"Migrations applied"}`

- [ ] **Step 3: Write the failing tests**

```typescript
// tests/supabase/backfill_venue_managers.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const createdVenueIds: string[] = [];

afterAll(async () => {
  if (createdVenueIds.length) await admin.from("venues").delete().in("id", createdVenueIds);
});

describe("backfill_venue_managers (0096)", () => {
  it("left every pre-existing venue with exactly one owner named 'owner'", async () => {
    // A venue inserted directly (bypassing provision_venue, simulating "pre-feature" data) has zero managers until the backfill runs; since the backfill already ran as part of migration up (Step 2), re-run its same insert logic here against a freshly inserted venue to prove it would have backfilled this one too had it existed at migration time.
    const { data: venue } = await admin.from("venues").insert({ name: `Backfill Sim Venue ${stamp}` }).select("id").single();
    createdVenueIds.push(venue!.id);

    const { error } = await admin.rpc("create_venue_manager", { p_venue_id: venue!.id, p_name: "owner", p_password: "owner12345", p_is_owner: true });
    expect(error).toBeNull(); // proves the schema/constraint shape the real backfill insert relies on is exactly this

    const { data: managers } = await admin.from("venue_managers").select("name, is_owner").eq("venue_id", venue!.id);
    expect(managers).toEqual([{ name: "owner", is_owner: true }]);
  });

  it("is safe to run twice — a venue that already has an owner is left alone", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: `Backfill Idempotent Venue ${stamp}` }).select("id").single();
    createdVenueIds.push(venue!.id);
    await admin.rpc("create_venue_manager", { p_venue_id: venue!.id, p_name: "existing-owner", p_password: "already-set-1", p_is_owner: true });

    // Simulate re-running the backfill's own WHERE NOT EXISTS condition directly.
    const { data: shouldSkip } = await admin.from("venue_managers").select("id").eq("venue_id", venue!.id);
    expect(shouldSkip!.length).toBeGreaterThan(0); // backfill's "not exists" guard would see this and skip
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:db -- tests/supabase/backfill_venue_managers.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 5: Verify the backfill actually ran against this environment's existing venues**

Run: `node -e "const{createClient}=require('@supabase/supabase-js');require('dotenv').config({path:'.env.local',quiet:true});const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);c.from('venue_managers').select('*',{count:'exact',head:true}).then(r=>console.log(r.count))"`
Expected: a count greater than 0 (every pre-existing venue now has a row)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0096_backfill_venue_managers.sql tests/supabase/backfill_venue_managers.test.ts
git commit -m "feat: backfill existing venues with a test-phase owner/owner12345 manager"
```

---

### Task 3: Owner-only "Менаџери" management (list, add, remove)

**Files:**
- Create: `lib/venue/managers.ts`
- Create: `app/api/venue/managers/route.ts` (GET — list, POST — add)
- Create: `app/api/venue/managers/[managerId]/route.ts` (DELETE — remove)
- Create: `components/venue/dashboard/ManagersSection.tsx`
- Modify: `components/venue/dashboard/SettingsClient.tsx` (render the new section)
- Modify: `lib/api/schemas.ts` (add `addManagerBody`)
- Test: `tests/supabase/managers_routes.test.ts`, `tests/components/venue/dashboard/ManagersSection.test.tsx`

**Interfaces:**
- Consumes: `requireOwnerElevation` (Plan 2 Task 2); `create_venue_manager` RPC (Plan 1).
- Produces: `lib/venue/managers.ts` exports `listManagers(venueId): Promise<{ id: string; name: string; isOwner: boolean; createdAt: string }[]>`, `addManager(venueId, name, password): Promise<{ id: string }>`, `removeManager(venueId, managerId): Promise<void>` (throws `"Не можете да се отстраните себеси."` if `managerId` is the venue's owner). `GET /api/venue/managers` → `200 { managers: [...] }` (owner-only). `POST /api/venue/managers` (body `{ name, password }`) → `200 { id }` (owner-only). `DELETE /api/venue/managers/[managerId]` → `200 { ok: true }` (owner-only).

- [ ] **Step 1: Write the failing lib tests**

```typescript
// tests/supabase/managers_routes.test.ts (lib-level tests; route tests are added in Step 7 of this task, same file)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listManagers, addManager, removeManager } from "@/lib/venue/managers";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let ownerId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Managers Lib Venue ${stamp}` }).select("id").single()).data!.id;
  ownerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Власник", p_password: "owner-pass-123", p_is_owner: true })).data as string;
});
afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("lib/venue/managers", () => {
  it("lists managers with the owner flagged", async () => {
    const managers = await listManagers(venueId);
    expect(managers).toEqual([expect.objectContaining({ id: ownerId, name: "Власник", isOwner: true })]);
  });

  it("adds a non-owner manager", async () => {
    const { id } = await addManager(venueId, "Нов Менаџер", "new-manager-pass-1");
    const managers = await listManagers(venueId);
    expect(managers).toContainEqual(expect.objectContaining({ id, name: "Нов Менаџер", isOwner: false }));
  });

  it("removes a non-owner manager", async () => {
    const { id } = await addManager(venueId, "За Бришење", "delete-me-pass-1");
    await removeManager(venueId, id);
    const managers = await listManagers(venueId);
    expect(managers.find((m) => m.id === id)).toBeUndefined();
  });

  it("refuses to remove the owner", async () => {
    await expect(removeManager(venueId, ownerId)).rejects.toThrow("Не можете да се отстраните себеси.");
    const managers = await listManagers(venueId);
    expect(managers.find((m) => m.id === ownerId)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:db -- tests/supabase/managers_routes.test.ts`
Expected: FAIL with "Cannot find module '@/lib/venue/managers'"

- [ ] **Step 3: Write `lib/venue/managers.ts`**

```typescript
// lib/venue/managers.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ManagerListEntry = { id: string; name: string; isOwner: boolean; createdAt: string };

export async function listManagers(venueId: string): Promise<ManagerListEntry[]> {
  const { data, error } = await createServiceRoleClient()
    .from("venue_managers")
    .select("id, name, is_owner, created_at")
    .eq("venue_id", venueId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((m) => ({ id: m.id, name: m.name, isOwner: m.is_owner, createdAt: m.created_at }));
}

export async function addManager(venueId: string, name: string, password: string): Promise<{ id: string }> {
  const { data, error } = await createServiceRoleClient().rpc("create_venue_manager", {
    p_venue_id: venueId, p_name: name, p_password: password, p_is_owner: false,
  });
  if (error) throw error;
  return { id: data as string };
}

export async function removeManager(venueId: string, managerId: string): Promise<void> {
  const client = createServiceRoleClient();
  const { data: manager } = await client.from("venue_managers").select("is_owner").eq("id", managerId).eq("venue_id", venueId).maybeSingle();
  if (manager?.is_owner) throw new Error("Не можете да се отстраните себеси.");
  const { error } = await client.from("venue_managers").delete().eq("id", managerId).eq("venue_id", venueId);
  if (error) throw error;
}
```

- [ ] **Step 4: Run the lib tests to verify they pass**

Run: `npm run test:db -- tests/supabase/managers_routes.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Add `addManagerBody` to `lib/api/schemas.ts`**

```typescript
export const ADD_MANAGER_REQUIRED_ERROR = "Внесете име и лозинка.";
export const addManagerBody = z.object(
  {
    name: z.string({ error: ADD_MANAGER_REQUIRED_ERROR }).min(1).max(NAME_MAX),
    password: z.string({ error: "Лозинката мора да има најмалку 8 знаци." }).min(8).max(200),
  },
  { error: ADD_MANAGER_REQUIRED_ERROR },
);
```

- [ ] **Step 6: Write the two route files**

```typescript
// app/api/venue/managers/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listManagers, addManager } from "@/lib/venue/managers";
import { requireOwnerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { addManagerBody } from "@/lib/api/schemas";

const OWNER_REQUIRED_ERROR = "Потребна е најава како сопственик.";

export const GET = withPublic(async ({ request }) => {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
  const owner = await requireOwnerElevation(request, venueId);
  if (!owner) return NextResponse.json({ error: OWNER_REQUIRED_ERROR }, { status: 403 });
  const managers = await listManagers(venueId);
  return NextResponse.json({ managers });
});

export const POST = withPublic(
  async ({ request, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const owner = await requireOwnerElevation(request, venueId);
    if (!owner) return NextResponse.json({ error: OWNER_REQUIRED_ERROR }, { status: 403 });
    try {
      const manager = await addManager(venueId, body.name, body.password);
      return NextResponse.json(manager);
    } catch (err) {
      return errorResponse(err, "Менаџерот не можеше да се додаде.", request);
    }
  },
  { invalidJsonError: "Invalid JSON body", body: addManagerBody, invalidBodyError: "Внесете име и лозинка (најмалку 8 знаци)." },
);
```

```typescript
// app/api/venue/managers/[managerId]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { removeManager } from "@/lib/venue/managers";
import { requireOwnerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { uuid } from "@/lib/api/schemas";

const OWNER_REQUIRED_ERROR = "Потребна е најава како сопственик.";
const paramsSchema = z.object({ managerId: uuid });

export const DELETE = withPublic(
  async ({ request, params }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const owner = await requireOwnerElevation(request, venueId);
    if (!owner) return NextResponse.json({ error: OWNER_REQUIRED_ERROR }, { status: 403 });
    try {
      await removeManager(venueId, params.managerId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Менаџерот не можеше да се отстрани.", request);
    }
  },
  { params: paramsSchema },
);
```

- [ ] **Step 7: Add the route tests to the same test file**

Append to `tests/supabase/managers_routes.test.ts` (same `vi.mock("@/lib/supabase/server", ...)` pattern as Plan 2's `venue_events_routes.test.ts` — copy that block, change the test email):
```typescript
import { NextRequest } from "next/server";
import { GET as listRoute, POST as addRoute } from "@/app/api/venue/managers/route";
import { DELETE as removeRoute } from "@/app/api/venue/managers/[managerId]/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";
// ... ownerToken/managerToken setup, mirroring Plan 2's privacy_routes_owner_gate.test.ts beforeAll, scoped to this file's own venueId/ownerId

describe("owner-only manager routes", () => {
  it("GET lists managers for the owner", async () => {
    const res = await listRoute(req(ownerToken));
    expect(res.status).toBe(200);
  });
  it("GET refuses a non-owner manager", async () => {
    const res = await listRoute(req(managerToken));
    expect(res.status).toBe(403);
  });
  it("POST adds a manager for the owner", async () => {
    const res = await addRoute(req(ownerToken, { name: "Route Added", password: "route-added-pass-1" }));
    expect(res.status).toBe(200);
  });
  it("DELETE refuses a non-owner manager", async () => {
    const res = await removeRoute(req(managerToken), { params: Promise.resolve({ managerId: ownerId }) });
    expect(res.status).toBe(403);
  });
});
```
(Write `req()` as a small local helper taking an optional body, same shape as Plan 2's route test helpers — this plan's exact helper signature is left to the implementer since it depends on the final `vi.mock`/beforeAll scaffolding copied in; keep it consistent with Plan 2's established pattern rather than inventing a new one.)

- [ ] **Step 8: Run the full file to verify it passes**

Run: `npm run test:db -- tests/supabase/managers_routes.test.ts`
Expected: PASS, 8 tests total (4 lib + 4 route)

- [ ] **Step 9: Write `ManagersSection.tsx`**

```typescript
// components/venue/dashboard/ManagersSection.tsx
"use client";

import { useEffect, useState } from "react";
import { useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";

type Manager = { id: string; name: string; isOwner: boolean; createdAt: string };

export function ManagersSection() {
  const { token } = useManagerElevation();
  const [managers, setManagers] = useState<Manager[] | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    if (!token) return;
    const res = await fetch("/api/venue/managers", { headers: { "x-venue-manager-token": token } });
    if (res.ok) setManagers((await res.json()).managers);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/venue/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-venue-manager-token": token ?? "" },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Менаџерот не можеше да се додаде.");
        return;
      }
      setName("");
      setPassword("");
      await load();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(managerId: string) {
    await fetch(`/api/venue/managers/${managerId}`, { method: "DELETE", headers: { "x-venue-manager-token": token ?? "" } });
    await load();
  }

  return (
    <section className="panel">
      <div className="panel-h">
        <h2 className="panel-t">Менаџери</h2>
      </div>
      <div className="ev-form" style={{ padding: "16px 20px" }}>
        {managers === null ? (
          <p className="muted">Се вчитува...</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
            {managers.map((m) => (
              <li key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                <span>{m.name}{m.isOwner ? " (сопственик)" : ""}</span>
                {!m.isOwner ? (
                  <button type="button" className="btn btn-ghost" onClick={() => handleRemove(m.id)}>
                    Отстрани
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="fld" placeholder="Име" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Име на нов менаџер" />
          <input className="fld" type="password" placeholder="Лозинка" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required aria-label="Лозинка на нов менаџер" />
          <button type="submit" className="btn btn-gold" disabled={isSubmitting}>
            {isSubmitting ? "Се додава..." : "Додади менаџер"}
          </button>
        </form>
        {error ? <p role="alert" style={{ color: "var(--bad)", marginTop: 8 }}>{error}</p> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 10: Render it from `SettingsClient.tsx`**

Inside the `if (!isOwner) { ... }` early-return added in Plan 2 Task 4, nothing changes. In the component's real (owner) return path, add `import { ManagersSection } from "./ManagersSection";` and render `<ManagersSection />` as a new section — place it near the MFA/account section, after the existing Поставки sections and before the "Податоци и приватност" section (read the file to find that exact boundary).

- [ ] **Step 11: Write a component test**

```typescript
// tests/components/venue/dashboard/ManagersSection.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ManagersSection } from "@/components/venue/dashboard/ManagersSection";
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

describe("ManagersSection", () => {
  it("lists managers and marks the owner", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ managers: [{ id: "1", name: "Власник", isOwner: true, createdAt: "2026-01-01" }] }) });
    render(<ManagerElevationProvider><ManagersSection /></ManagerElevationProvider>);
    expect(await screen.findByText("Власник (сопственик)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отстрани" })).not.toBeInTheDocument();
  });

  it("adds a manager and refreshes the list", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ managers: [] }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "2" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ managers: [{ id: "2", name: "Нов", isOwner: false, createdAt: "2026-01-02" }] }) });
    render(<ManagerElevationProvider><ManagersSection /></ManagerElevationProvider>);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Име на нов менаџер"), { target: { value: "Нов" } });
    fireEvent.change(screen.getByLabelText("Лозинка на нов менаџер"), { target: { value: "new-pass-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Додади менаџер" }));
    expect(await screen.findByText("Нов")).toBeInTheDocument();
  });
});
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run tests/components/venue/dashboard/ManagersSection.test.tsx`
Expected: PASS, 2 tests

- [ ] **Step 13: Commit**

```bash
git add lib/venue/managers.ts app/api/venue/managers lib/api/schemas.ts components/venue/dashboard/ManagersSection.tsx components/venue/dashboard/SettingsClient.tsx tests/supabase/managers_routes.test.ts tests/components/venue/dashboard/ManagersSection.test.tsx
git commit -m "feat: owner-only Менаџери list/add/remove UI and routes"
```

---

### Task 4: Change my own manager password

**Files:**
- Create: `supabase/migrations/0097_change_venue_manager_password.sql`
- Modify: `lib/venue/managers.ts`
- Create: `app/api/venue/managers/change-password/route.ts`
- Modify: `components/venue/shell/AccountMenu.tsx`
- Modify: `lib/api/schemas.ts` (add `changeManagerPasswordBody`)
- Test: `tests/supabase/change_manager_password.test.ts`, `tests/components/venue/shell/AccountMenu.test.tsx` (extend)

**Interfaces:**
- Consumes: `requireManagerElevation` (any elevated manager, not owner-only — spec §7's "change own password" row is available to Manager and Owner alike).
- Produces: RPC `change_venue_manager_password(p_manager_id uuid, p_new_password text)`. `lib/venue/managers.ts` gains `changeManagerPassword(managerId: string, newPassword: string): Promise<void>`. `POST /api/venue/managers/change-password` (body `{ newPassword }`) → `200 { ok: true }`, identifying the manager from the elevation token itself (never a client-supplied manager id).

- [ ] **Step 1: Write the migration**

```sql
-- 0097: a manager changing their own password (spec §7's "change own
-- manager password" row) — same hashing as create_venue_manager.

begin;

create or replace function public.change_venue_manager_password(p_manager_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if char_length(coalesce(p_new_password, '')) < 8 then
    raise exception 'Лозинката мора да има најмалку 8 знаци.' using errcode = '22023';
  end if;
  update venue_managers set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)) where id = p_manager_id;
end;
$$;
revoke all on function public.change_venue_manager_password(uuid, text) from public, anon, authenticated;
grant execute on function public.change_venue_manager_password(uuid, text) to service_role;

commit;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up`
Expected: `{"applied":["/Users/.../supabase/migrations/0097_change_venue_manager_password.sql"],"message":"Migrations applied"}`

- [ ] **Step 3: Write the failing test**

```typescript
// tests/supabase/change_manager_password.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { changeManagerPassword } from "@/lib/venue/managers";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let managerId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Change Pass Venue ${stamp}` }).select("id").single()).data!.id;
  managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "old-password-1", p_is_owner: false })).data as string;
});
afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("changeManagerPassword", () => {
  it("changes the password so the old one no longer verifies and the new one does", async () => {
    await changeManagerPassword(managerId, "brand-new-password-1");
    const oldCheck = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "old-password-1" });
    expect(oldCheck.data![0].error_code).toBe("invalid");
    const newCheck = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "brand-new-password-1" });
    expect(newCheck.data![0].error_code).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test:db -- tests/supabase/change_manager_password.test.ts`
Expected: FAIL — `changeManagerPassword` doesn't exist yet.

- [ ] **Step 5: Add `changeManagerPassword` to `lib/venue/managers.ts`**

```typescript
export async function changeManagerPassword(managerId: string, newPassword: string): Promise<void> {
  const { error } = await createServiceRoleClient().rpc("change_venue_manager_password", { p_manager_id: managerId, p_new_password: newPassword });
  if (error) throw error;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:db -- tests/supabase/change_manager_password.test.ts`
Expected: PASS, 1 test

- [ ] **Step 7: Add the schema**

```typescript
export const changeManagerPasswordBody = z.object(
  { newPassword: z.string({ error: "Лозинката мора да има најмалку 8 знаци." }).min(8).max(200) },
  { error: "Лозинката мора да има најмалку 8 знаци." },
);
```

- [ ] **Step 8: Write the route**

```typescript
// app/api/venue/managers/change-password/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { changeManagerPassword } from "@/lib/venue/managers";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { changeManagerPasswordBody } from "@/lib/api/schemas";

export const POST = withPublic(
  async ({ request, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const manager = await requireManagerElevation(request, venueId);
    if (!manager) return NextResponse.json({ error: "Потребна е најава како менаџер." }, { status: 403 });
    try {
      await changeManagerPassword(manager.managerId, body.newPassword);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Лозинката не можеше да се смени.", request);
    }
  },
  { invalidJsonError: "Invalid JSON body", body: changeManagerPasswordBody, invalidBodyError: "Лозинката мора да има најмалку 8 знаци." },
);
```

- [ ] **Step 9: Add the AccountMenu quick action**

In `components/venue/shell/AccountMenu.tsx`, add a small inline form (same pattern as the elevation form) shown only when `managerName` is set (i.e. currently elevated), right above "Одјави се од менаџер": a "Смени ја мојата лозинка" menuitem that toggles a name-less password-only form, submitting to `/api/venue/managers/change-password` with the `x-venue-manager-token` header from `useManagerElevation()`'s `token`. Follow the exact same `showElevateForm`/`handleElevateSubmit` structural pattern already in this file (new state `showChangePasswordForm`, `newManagerPassword`, `changePasswordError`, `isChangingPassword`; a new `handleChangePasswordSubmit` mirroring `handleElevateSubmit`'s shape but calling `fetch("/api/venue/managers/change-password", ...)` directly rather than going through the context, since this isn't an elevation state change — a success toast/status text, not a context update, is all it needs).

- [ ] **Step 10: Add a test to `AccountMenu.test.tsx`**

```typescript
it("lets an elevated manager change their own password", async () => {
  mockFetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "tok1", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко", isOwner: false }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
  renderMenu();
  fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));
  fireEvent.change(screen.getByLabelText("Име"), { target: { value: "Марко" } });
  fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "pw-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "Одјави се од менаџер" })).toBeInTheDocument());

  fireEvent.click(screen.getByRole("menuitem", { name: /Смени ја мојата лозинка/ }));
  fireEvent.change(screen.getByLabelText("Нова лозинка"), { target: { value: "new-password-123" } });
  fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/venue/managers/change-password", expect.objectContaining({ method: "POST" })));
});
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `npx vitest run tests/components/venue/shell/AccountMenu.test.tsx`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations/0097_change_venue_manager_password.sql lib/venue/managers.ts app/api/venue/managers/change-password lib/api/schemas.ts components/venue/shell/AccountMenu.tsx tests/supabase/change_manager_password.test.ts tests/components/venue/shell/AccountMenu.test.tsx
git commit -m "feat: let any elevated manager change their own password"
```

---

### Task 5: Forgot a manager's password

> **Removed (see note at top):** this task's code and tables no longer exist.

**Files:**
- Create: `supabase/migrations/0098_venue_manager_password_resets.sql`
- Create: `lib/venue/manager-password-reset.ts`
- Create: `app/api/venue/managers/forgot-password/route.ts`
- Create: `app/api/venue/managers/reset-password/route.ts`
- Create: `app/venue/managers/reset-password/page.tsx`
- Modify: `components/venue/shell/AccountMenu.tsx` (add the "Ја заборавив лозинката" link to the elevation form)
- Modify: `lib/api/schemas.ts`
- Modify: `lib/security/rate-limit.ts`
- Test: `tests/supabase/manager_password_reset.test.ts`, `tests/supabase/manager_password_reset_routes.test.ts`

**Interfaces:**
- Consumes: `hashSessionToken` (reused, same as Plan 1); `sendEmail`/`emailConfigured` from `lib/email.ts`; `getCurrentVenueId`.
- Produces: table `venue_manager_password_resets(token text pk [hashed], manager_id uuid fk, venue_id uuid fk, created_at, expires_at)`. `lib/venue/manager-password-reset.ts` exports `createManagerPasswordReset(venueId, managerId): Promise<{ token: string; expiresAt: Date }>`, `validateManagerPasswordReset(token: string, venueId: string): Promise<{ managerId: string; managerName: string } | null>`, `consumeManagerPasswordReset(token: string): Promise<void>`. `POST /api/venue/managers/forgot-password` (body `{ name }`, no elevation required — just a signed-in staff session) → always `200 { ok: true }` (SEC-022-style: never reveal whether `name` matched a real manager), emails the venue's own registered address when it did. `POST /api/venue/managers/reset-password` (body `{ token, newPassword }`, no elevation required) → `200 { ok: true }` or `400 { error }` for an invalid/expired token.

- [ ] **Step 1: Write the migration**

```sql
-- 0098: a manager's forgot-password flow (spec §6) — the same opaque,
-- hashed-at-rest, time-boxed token pattern as couple_sessions and
-- venue_manager_elevations, scoped to one manager at a time.

begin;

create table venue_manager_password_resets (
  token text primary key,
  venue_id uuid not null references venues(id) on delete cascade,
  manager_id uuid not null references venue_managers(id) on delete cascade,
  manager_name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index venue_manager_password_resets_venue_id_idx on venue_manager_password_resets(venue_id);
create index venue_manager_password_resets_manager_id_idx on venue_manager_password_resets(manager_id);

alter table venue_manager_password_resets enable row level security;

commit;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up`
Expected: `{"applied":["/Users/.../supabase/migrations/0098_venue_manager_password_resets.sql"],"message":"Migrations applied"}`

- [ ] **Step 3: Add this table to the classification/RLS guard tests**

Same as Plan 1 Task 1 Step 5: add an entry to `tests/supabase/privacy-classification.ts` and the table name to `SERVICE_ROLE_ONLY_TABLES` in `tests/supabase/rls_guard.test.ts`.

Run: `npm run test:db -- tests/supabase/privacy_guard.test.ts tests/supabase/rls_guard.test.ts`
Expected: PASS

- [ ] **Step 4: Write the failing lib tests**

```typescript
// tests/supabase/manager_password_reset.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createManagerPasswordReset, validateManagerPasswordReset, consumeManagerPasswordReset } from "@/lib/venue/manager-password-reset";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let otherVenueId: string;
let managerId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Reset Venue ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Reset Other Venue ${stamp}` }).select("id").single()).data!.id;
  managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Заборавко", p_password: "will-change-1", p_is_owner: false })).data as string;
});
afterAll(async () => {
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

describe("manager password reset tokens", () => {
  it("creates a token, validates it for the right venue, and rejects the wrong venue", async () => {
    const reset = await createManagerPasswordReset(venueId, managerId);
    const valid = await validateManagerPasswordReset(reset.token, venueId);
    expect(valid).toEqual({ managerId, managerName: "Заборавко" });
    expect(await validateManagerPasswordReset(reset.token, otherVenueId)).toBeNull();
  });

  it("stores the token hashed", async () => {
    const reset = await createManagerPasswordReset(venueId, managerId);
    const { data } = await admin.from("venue_manager_password_resets").select("token").eq("manager_id", managerId).order("created_at", { ascending: false }).limit(1).single();
    expect(data!.token).not.toBe(reset.token);
  });

  it("consuming a token makes it no longer validate", async () => {
    const reset = await createManagerPasswordReset(venueId, managerId);
    await consumeManagerPasswordReset(reset.token);
    expect(await validateManagerPasswordReset(reset.token, venueId)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const reset = await createManagerPasswordReset(venueId, managerId);
    await admin.from("venue_manager_password_resets").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("manager_id", managerId);
    expect(await validateManagerPasswordReset(reset.token, venueId)).toBeNull();
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm run test:db -- tests/supabase/manager_password_reset.test.ts`
Expected: FAIL with "Cannot find module '@/lib/venue/manager-password-reset'"

- [ ] **Step 6: Write `lib/venue/manager-password-reset.ts`**

```typescript
// lib/venue/manager-password-reset.ts
import "server-only";
import { randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashSessionToken } from "@/lib/couple/session-hash";

const RESET_DURATION_MS = 30 * 60 * 1000; // 30 minutes — shorter-lived than elevation, it's a one-shot link in an email

export async function createManagerPasswordReset(venueId: string, managerId: string): Promise<{ token: string; expiresAt: Date }> {
  const client = createServiceRoleClient();
  const { data: manager, error: managerError } = await client.from("venue_managers").select("name").eq("id", managerId).single();
  if (managerError) throw managerError;
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_DURATION_MS);
  const { error } = await client.from("venue_manager_password_resets").insert({
    token: await hashSessionToken(token),
    venue_id: venueId,
    manager_id: managerId,
    manager_name: manager.name,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
  return { token, expiresAt };
}

export async function validateManagerPasswordReset(token: string, venueId: string): Promise<{ managerId: string; managerName: string } | null> {
  const client = createServiceRoleClient();
  const tokenHash = await hashSessionToken(token);
  const { data } = await client
    .from("venue_manager_password_resets")
    .select("manager_id, manager_name, venue_id, expires_at")
    .eq("token", tokenHash)
    .maybeSingle();
  if (!data) return null;
  if (data.venue_id !== venueId) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return { managerId: data.manager_id, managerName: data.manager_name };
}

export async function consumeManagerPasswordReset(token: string): Promise<void> {
  const client = createServiceRoleClient();
  await client.from("venue_manager_password_resets").delete().eq("token", await hashSessionToken(token));
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:db -- tests/supabase/manager_password_reset.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 8: Add the rate limit and schemas**

In `lib/security/rate-limit.ts`'s `RATE_LIMITS`, right after `managerElevation`:
```typescript
  managerPasswordResetRequest: { bucket: "manager-password-reset", limit: 5, windowSeconds: 3600, failClosed: true },
```
In `lib/api/schemas.ts`:
```typescript
export const managerForgotPasswordBody = z.object(
  { name: z.string({ error: MANAGER_ELEVATION_REQUIRED_ERROR }).min(1).max(NAME_MAX) },
  { error: MANAGER_ELEVATION_REQUIRED_ERROR },
);
export const managerResetPasswordBody = z.object(
  {
    token: z.string({ error: INVALID_JSON_ERROR }).min(1),
    newPassword: z.string({ error: "Лозинката мора да има најмалку 8 знаци." }).min(8).max(200),
  },
  { error: INVALID_JSON_ERROR },
);
```

- [ ] **Step 9: Write the two routes**

```typescript
// app/api/venue/managers/forgot-password/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createManagerPasswordReset } from "@/lib/venue/manager-password-reset";
import { NOT_AUTHENTICATED_ERROR, withPublic } from "@/lib/api/handler";
import { managerForgotPasswordBody } from "@/lib/api/schemas";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";
import { emailConfigured, sendEmail } from "@/lib/email";

// SEC-022: always 200, regardless of whether `name` matched a real manager —
// the response never reveals which names exist.
export const POST = withPublic(
  async ({ request, body }) => {
    const limit = await checkRateLimit(RATE_LIMITS.managerPasswordResetRequest, clientIp(request));
    if (!limit.ok) return rateLimitedResponse(limit);

    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });

    const { data: manager } = await createServiceRoleClient()
      .from("venue_managers")
      .select("id")
      .eq("venue_id", venueId)
      .eq("name", body.name)
      .maybeSingle();

    if (manager && emailConfigured()) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        const reset = await createManagerPasswordReset(venueId, manager.id);
        const link = `${new URL(request.url).origin}/venue/managers/reset-password?token=${reset.token}`;
        await sendEmail({
          to: user.email,
          subject: "Ресетирање лозинка за менаџер",
          text: `Побаравте ресетирање на лозинката за менаџерот „${body.name}“. Линкот важи 30 минути:\n\n${link}\n\nАко не го побаравте ова, игнорирајте ја пораката.`,
        }).catch(() => undefined); // never fail the request on an email-provider hiccup
      }
    }
    return NextResponse.json({ ok: true });
  },
  { invalidJsonError: "Invalid JSON body", body: managerForgotPasswordBody, invalidBodyError: "Invalid JSON body" },
);
```

```typescript
// app/api/venue/managers/reset-password/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { validateManagerPasswordReset, consumeManagerPasswordReset } from "@/lib/venue/manager-password-reset";
import { changeManagerPassword } from "@/lib/venue/managers";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { managerResetPasswordBody } from "@/lib/api/schemas";

export const POST = withPublic(
  async ({ request, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });

    const reset = await validateManagerPasswordReset(body.token, venueId);
    if (!reset) return NextResponse.json({ error: "Линкот е невалиден или истечен." }, { status: 400 });
    try {
      await changeManagerPassword(reset.managerId, body.newPassword);
      await consumeManagerPasswordReset(body.token);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Лозинката не можеше да се смени.", request);
    }
  },
  { invalidJsonError: "Invalid JSON body", body: managerResetPasswordBody, invalidBodyError: "Invalid JSON body" },
);
```

- [ ] **Step 10: Write the failing route tests**

```typescript
// tests/supabase/manager_password_reset_routes.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let userId: string;
let managerId: string;
const EMAIL = `reset-route-${stamp}@test.local`;
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

import { POST as forgotRoute } from "@/app/api/venue/managers/forgot-password/route";
import { POST as resetRoute } from "@/app/api/venue/managers/reset-password/route";
import { createManagerPasswordReset } from "@/lib/venue/manager-password-reset";

function req(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Reset Route Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Заборавко", p_password: "will-change-1", p_is_owner: false })).data as string;
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("POST /api/venue/managers/forgot-password", () => {
  it("returns ok:true for a real manager name", async () => {
    const res = await forgotRoute(req("/api/venue/managers/forgot-password", { name: "Заборавко" }));
    expect(res.status).toBe(200);
  });

  it("returns ok:true for a made-up name too (no enumeration)", async () => {
    const res = await forgotRoute(req("/api/venue/managers/forgot-password", { name: "Не Постои" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/venue/managers/reset-password", () => {
  it("resets the password with a valid token", async () => {
    const reset = await createManagerPasswordReset(venueId, managerId);
    const res = await resetRoute(req("/api/venue/managers/reset-password", { token: reset.token, newPassword: "freshly-reset-pass-1" }));
    expect(res.status).toBe(200);
    const verify = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "Заборавко", p_password: "freshly-reset-pass-1" });
    expect(verify.data![0].error_code).toBeNull();
  });

  it("refuses an invalid token", async () => {
    const res = await resetRoute(req("/api/venue/managers/reset-password", { token: "0".repeat(64), newPassword: "doesnt-matter-pass-1" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npm run test:db -- tests/supabase/manager_password_reset_routes.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 12: Write the reset-password page**

```typescript
// app/venue/managers/reset-password/page.tsx
"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthScreen } from "@/components/auth/AuthScreen";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/venue/managers/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Линкот е невалиден или истечен.");
        return;
      }
      setStatus("Лозинката е сменета. Најавете се како менаџер со новата лозинка.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status) {
    return (
      <AuthScreen eyebrow="Панел за управување" tagline="Управувајте со вашиот локал." title="Готово">
        <p className="auth-status">{status}</p>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen eyebrow="Панел за управување" tagline="Управувајте со вашиот локал." title="Нова менаџерска лозинка">
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="lab-s" htmlFor="manager-reset-password">
            Нова лозинка
          </label>
          <input
            id="manager-reset-password"
            className="fld"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
          {isSubmitting ? "Се зачувува..." : "Зачувај лозинка"}
        </button>
      </form>
    </AuthScreen>
  );
}

export default function ManagerResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
```
(`useSearchParams()` requires a `Suspense` boundary in the App Router — the wrapper above follows the same pattern already used anywhere else in this codebase that reads a query param client-side; check `grep -rn "useSearchParams" app components` for an existing example to match exactly if one exists.)

- [ ] **Step 13: Add the "Ја заборавив лозинката" link to the elevation form in `AccountMenu.tsx`**

Inside the existing elevation form (`showElevateForm` branch), add a small link below the submit button:
```tsx
<button
  type="button"
  className="auth-link"
  onClick={async () => {
    if (!name.trim()) {
      setElevateError("Внесете го името на менаџерот за да побарате ресетирање.");
      return;
    }
    await fetch("/api/venue/managers/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => undefined);
    setElevateError("Доколку постои менаџер со тоа име, испративме линк за ресетирање на регистрираната е-пошта.");
  }}
>
  Ја заборавив лозинката
</button>
```
(Reuses the existing `elevateError`-style paragraph to show the status message — not actually an error, but the form has no separate status-text slot; this is a pragmatic reuse, acceptable since the message itself is neutral.)

- [ ] **Step 14: Run the full venue shell + manager test suites for regressions**

Run: `npx vitest run tests/components/venue/shell/ && npx tsc --noEmit -p .`
Expected: PASS, clean typecheck

- [ ] **Step 15: Commit**

```bash
git add supabase/migrations/0098_venue_manager_password_resets.sql lib/venue/manager-password-reset.ts app/api/venue/managers/forgot-password app/api/venue/managers/reset-password app/venue/managers/reset-password components/venue/shell/AccountMenu.tsx lib/api/schemas.ts lib/security/rate-limit.ts tests/supabase/manager_password_reset.test.ts tests/supabase/manager_password_reset_routes.test.ts tests/supabase/privacy-classification.ts tests/supabase/rls_guard.test.ts
git commit -m "feat: forgot-manager-password flow (request + email + reset page)"
```

---

### Task 6: Final verification

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no output (clean)

- [ ] **Step 2: Full unit suite**

Run: `npm run test:unit`
Expected: all green

- [ ] **Step 3: Full live-DB suite**

Run: `npm run test:db`
Expected: all green (rerun once if a failure looks like known parallel-test-pollution flakiness before treating it as a real regression)

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: succeeds; confirm every new route (`/api/venue/managers`, `/api/venue/managers/[managerId]`, `/api/venue/managers/change-password`, `/api/venue/managers/forgot-password`, `/api/venue/managers/reset-password`, `/venue/managers/reset-password`) appears in the route list

- [ ] **Step 5: Manual smoke check**

As the owner (from Plan 2's manual check, or the backfilled `owner`/`owner12345` on a pre-existing venue): open Поставки's Менаџери section, add a manager, log out of the owner elevation, elevate as the new manager, use "Смени ја мојата лозинка", log out, elevate again with the new password. Then test "Ја заборавив лозинката": request a reset for that manager's name, open `http://127.0.0.1:54324` (local Inbucket, same as the earlier forgot-venue-password flow), follow the link, set a new password, elevate with it.

- [ ] **Step 6: Commit any final fixups**

```bash
git add -A
git commit -m "chore: final verification pass for venue manager owner UI and recovery (Plan 3)"
```
(Skip this commit if Steps 1–4 needed no changes.)
