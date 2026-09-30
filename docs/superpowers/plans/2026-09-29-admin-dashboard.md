# Platform Admin Dashboard and Plan Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An `admin.<domain>` dashboard where the product owner oversees and supports every venue, and builds plans (feature switches + limits) that venues and individual events get, enforced by the server and the database.

**Architecture:** Same Next.js 16 app and Vercel project. `proxy.ts` rewrites every request on an `admin.` host to `app/admin/*` and 404s `/admin` elsewhere. Admin = Supabase Auth user with `app_metadata.role = "platform_admin"` and mandatory TOTP, checked by one `requireAdmin()` guard used by every admin page and Server Action. Entitlements live in Postgres (`plans`, `plan_features`, per-venue and per-event overrides) resolved by one SQL function and enforced by triggers, the couple API wrapper, and lock UI.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions, `proxy.ts`), React 19, TypeScript, Supabase (Postgres 17, Auth with TOTP MFA, supabase-js 2.112, @supabase/ssr 0.12), zod 4, Vitest 5 (unit + DB suites), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-admin-dashboard-design.md`

## Global Constraints

- `LOCAL_DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Node 22 for every command: prefix with `export PATH=/opt/homebrew/opt/node@22/bin:$PATH;`.
- **Never run `git commit`.** Each task's last step lists the commit commands for the user; no `Co-Authored-By` line (user memory).
- New migrations are numbered from `0047` upward, one file per task that needs one; apply locally with psql (see Session 1 context below); never edit an existing migration.
- Privileges are explicit (since 0031): new tables `enable row level security`, `revoke all … from anon, authenticated`, `grant … to service_role`; every new function `revoke all … from public, anon, authenticated` and grant only to the callers; `security definer` functions `set search_path = public, extensions, pg_temp`.
- Every new public table is classified in `tests/supabase/rls_guard.test.ts` (STAFF_TABLES or SERVICE_ROLE_ONLY_TABLES) and every new column in `tests/supabase/privacy-classification.ts`.
- Server modules using the service-role client start with `import "server-only";`.
- UI copy is Macedonian. Refusal messages, verbatim: locked feature „Оваа функција не е вклучена во вашиот пакет.“; guest limit „Достигнат е лимитот од {n} гости за овој настан.“; rooms limit „Достигнат е лимитот од {n} простории.“; active events limit „Достигнат е лимитот од {n} активни настани.“; blocked venue „Пристапот е привремено оневозможен.“; generic admin failure „Акцијата не успеа.“
- Admin code (`app/admin/**`, `lib/admin/**`) never references these tables: `event_guests`, `event_notes`, `event_budget_items`, `event_checklist_items`, `event_checklist_subtasks`, `event_agenda_items`, `event_locations`, `event_invitations`, `event_custom_menu_items`, `event_menu_item_quantities`, `couple_sessions`, `event_credentials` (except through the `regenerate_event_password` RPC and the lockout reset RPC defined here), and never selects `reservations.guest_name/phone/email/note` or `events.contact_email/contact_email_2/contact_phone` (spec D2).
- Gates for every task: `npm run typecheck`, `npm run lint`, `npm run test:unit`, and for DB work `npx vitest run -c vitest.db.config.ts <files>`; the last task of each phase runs the full `npm run test:db` and `npx playwright test`.
- Existing behaviour must not change for existing venues: the default plan unlocks every feature with unlimited limits.
- **Session 1 context (docs/MASTER.md, docs/sessions/SESSION-1-admin.md):** work in the worktree `/Users/filipmicevski/Desktop/wedding_planner-s1` (branch `s1-admin`). Three other sessions work in parallel in their own worktrees and share the local Supabase. **Apply migrations with `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql`** (not `supabase migration up`, which refuses to run when the shared DB holds other sessions' migrations, and never `supabase db reset`). Each migration is applied once; write them so a failed half-apply is impossible (they run in one psql call; wrap the body in `begin; … commit;`). Playwright runs with `E2E_PORT=3201`. DB-wide guard tests (`rls_guard`, `privileges`, `privacy_guard`, drift checks) enumerate every table/function in the shared DB, so they may fail only because of objects created by sessions 2–4 (e.g. `event_seat_assignments`, `event_photos`, `event_greetings`, `event_co_organizers`, `event_reminders`, anything from migrations 0060–0089): that is expected — report it, don't classify or touch other sessions' objects. A failure on an object from 0001–0059 is real. This session's migration numbers are 0047–0059 only. The default plan keeps `storage_gb` = 5 and `photo_retention_days` = 15 (the only limits it sets).
- The feature catalogue has 26 keys (17 original + `photo_album`, `guest_greetings`, `video_greetings`, `reminders`, `personal_invite_links`, `print_qr`, `storage_gb`, `photo_retention_days`, `co_organizers`, all scope `event`). No trigger enforces the 9 new keys in this plan; sessions 2–4 gate their own routes with `feature:`.

## Review Focus

- A venue whose plan was switched to one that locks a feature it already used (e.g. seating with confirmed layouts, 200 guests under a 150 limit): existing data must still display; only additions are refused (D7). Tests: Task 2.4 (guest limit with existing rows over the limit) and Task 2.6 (GET on a locked couple feature still 200).
- Admin opens the dashboard with a session that is `aal2` but whose `platform_admin` flag was removed server-side after sign-in: must be refused immediately, not until token expiry. Test: Task 1.3 (`requireAdmin` rejects when `getUser()` lacks the role even if the JWT claims have it).
- The same browser signed in as venue staff visits `admin.localhost:3000`: host-only cookies mean it is not signed in there; a staff user who signs in on the admin host is refused. Test: Task 1.4.
- Deleting a plan that venues use, or unsetting the only default plan: refused with a clear message. Test: Task 3.4.
- Public RSVP to a blocked venue's invitation, and to an event whose `max_guests` is reached by the RSVP itself (new guest via the link): blocked venue → RSVP still works; limit reached → RSVP refused with the limit message, existing guest updates still allowed. Tests: Task 2.4, Task 2.7.

---

## File Structure

**Phase 1 — foundation**
- `supabase/migrations/0047_admin_foundation.sql` — `audit_log.actor_type` gains `'admin'`; `venue_staff` trigger refusing platform admins; `admin_sign_out_user(uuid)`; `admin_unlock_couple_login(uuid)`.
- `lib/admin/host.ts` — `isAdminHost(host)`; pure.
- `proxy.ts` — admin-host rewrite, `/admin` 404 on other hosts, maintenance bypass for admin host.
- `lib/admin/guard.ts` — `requireAdmin()`, `AdminContext`.
- `lib/admin/actions.ts` — `adminAction()` wrapper for Server Actions (guard → zod → run → audit → result).
- `lib/audit.ts` — add `"admin"` to `actorType`.
- `app/admin/layout.tsx`, `app/admin/login/page.tsx`, `app/admin/(panel)/layout.tsx`, `app/admin/(panel)/page.tsx` (placeholder overview replaced in Phase 3), `components/admin/AdminShell.tsx`, `components/admin/nav.ts`.
- `scripts/make-admin.mjs`.
- Tests: `tests/lib/pure/admin-host.test.ts`, `tests/security/admin-routing.test.ts`, `tests/supabase/admin_guard.test.ts`, `tests/supabase/admin_foundation.test.ts`, `tests/components/admin/AdminLogin.test.tsx`, `tests/security/admin-static.test.ts`.

**Phase 2 — entitlements**
- `lib/entitlements/features.ts` — catalogue (keys, labels, scope, kind); pure.
- `supabase/migrations/0048_plans_and_entitlements.sql` — tables, default plan, backfill, `effective_features`, helpers, `provision_venue` default plan, blocked columns + `is_venue_staff_for`.
- `supabase/migrations/0049_entitlement_enforcement.sql` — limit and feature triggers.
- `lib/entitlements/server.ts` — `getEventFeatures`, `getVenueFeatures`, `eventHasFeature` (service role).
- `lib/api/handler.ts` — `feature` option on `withCoupleEvent`.
- all gated couple routes — pass `feature`.
- `lib/api/handler.ts` `isUserFacingError` — trigger messages with SQLSTATE `P0001` become user-facing.
- `lib/couple/session-verify.ts` — refuse sessions of blocked venues.
- `app/couple/(protected)/layout.tsx`, `components/couple/shell/CoupleShell.tsx`, `components/couple/shell/nav.ts`, `components/entitlements/LockedBanner.tsx` — lock icons + banner.
- `app/venue/layout.tsx`, `components/venue/shell/PanelShell.tsx`, `components/venue/shell/nav.ts`, `components/venue/BlockedScreen.tsx`.
- Tests: `tests/lib/pure/features.test.ts`, `tests/supabase/entitlements_resolution.test.ts`, `tests/supabase/entitlements_enforcement.test.ts`, `tests/supabase/blocked_venue.test.ts`, `tests/lib/api/feature-gate.test.ts`, `tests/components/couple/CoupleShellLocks.test.tsx`.

**Phase 3 — admin screens**
- `lib/admin/queries.ts` — read models for overview, venues, events, plans (service role, no D2 tables).
- `app/admin/(panel)/page.tsx` — overview.
- `app/admin/(panel)/venues/page.tsx`, `app/admin/(panel)/venues/[id]/page.tsx`, `app/admin/(panel)/venues/actions.ts`.
- `app/admin/(panel)/events/page.tsx`, `app/admin/(panel)/events/[id]/page.tsx`, `app/admin/(panel)/events/actions.ts`.
- `app/admin/(panel)/plans/page.tsx`, `app/admin/(panel)/plans/[id]/page.tsx`, `app/admin/(panel)/plans/actions.ts`.
- `components/admin/FeatureOverridesEditor.tsx`, `components/admin/PlanFeaturesEditor.tsx`, `components/admin/ConfirmTyped.tsx`, `components/admin/ActionForm.tsx`.
- Tests: `tests/supabase/admin_queries.test.ts`, `tests/supabase/admin_venue_actions.test.ts`, `tests/supabase/admin_event_actions.test.ts`, `tests/supabase/admin_plan_actions.test.ts`, `tests/components/admin/*.test.tsx`.

**Phase 4 — rest**
- `supabase/migrations/0050_contact_status_and_settings.sql` — `contact_submissions.status/handled_at`, `platform_settings`.
- `app/admin/(panel)/messages/*`, `app/admin/(panel)/audit/page.tsx`, `app/admin/(panel)/system/*`.
- `lib/platform-settings.ts` — cached maintenance flag read by `proxy.ts`.
- `e2e/admin.spec.ts`, `e2e/helpers.ts` (admin helpers), `docs/production/ADMIN.md`, `docs/production/SETUP.md`, `docs/production/SECRETS.md`, `docs/production/DATA-MAP.md` updates.

---

## Phase 1 — Foundation

### Task 1.1: Admin host detection and proxy routing

**Files:**
- Create: `lib/admin/host.ts`
- Modify: `proxy.ts` (functions `proxy`, `route`, `maintenanceResponse`)
- Test: `tests/lib/pure/admin-host.test.ts`, `tests/security/admin-routing.test.ts`

**Interfaces:**
- Produces: `isAdminHost(host: string | null | undefined): boolean`; proxy behaviour: admin host → rewrite to `/admin{path}` (path `/` → `/admin`); non-admin host `/admin` or `/admin/*` → 404.

- [ ] **Step 1: Write the failing tests**

`tests/lib/pure/admin-host.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isAdminHost } from "@/lib/admin/host";

describe("isAdminHost", () => {
  it("recognises the admin subdomain in production and locally", () => {
    expect(isAdminHost("admin.kadesum.mk")).toBe(true);
    expect(isAdminHost("admin.localhost:3000")).toBe(true);
    expect(isAdminHost("ADMIN.kadesum.mk")).toBe(true);
  });
  it("rejects everything else", () => {
    for (const h of ["kadesum.mk", "www.kadesum.mk", "localhost:3000", "notadmin.kadesum.mk", "admin-kadesum.mk", "", null, undefined]) {
      expect(isAdminHost(h), String(h)).toBe(false);
    }
  });
});
```

`tests/security/admin-routing.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function req(path: string, host: string) {
  return new NextRequest(new URL(path, `http://${host}`), { headers: { host } });
}

describe("admin subdomain routing", () => {
  it("rewrites every admin-host path under /admin", async () => {
    const root = await proxy(req("/", "admin.localhost:3000"));
    expect(root.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:3000/admin");
    const venues = await proxy(req("/venues?q=x", "admin.localhost:3000"));
    expect(venues.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:3000/admin/venues?q=x");
  });

  it("does not double-prefix a path that already starts with /admin", async () => {
    const res = await proxy(req("/admin/venues", "admin.localhost:3000"));
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:3000/admin/venues");
  });

  it("answers 404 for /admin on the main host", async () => {
    expect((await proxy(req("/admin", "localhost:3000"))).status).toBe(404);
    expect((await proxy(req("/admin/venues", "localhost:3000"))).status).toBe(404);
  });

  it("leaves main-host routing unchanged", async () => {
    const res = await proxy(req("/", "localhost:3000"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("ignores maintenance mode on the admin host", async () => {
    process.env.MAINTENANCE_MODE = "1";
    try {
      expect((await proxy(req("/", "admin.localhost:3000"))).status).toBe(200);
      expect((await proxy(req("/", "localhost:3000"))).status).toBe(503);
    } finally {
      delete process.env.MAINTENANCE_MODE;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/pure/admin-host.test.ts tests/security/admin-routing.test.ts`
Expected: FAIL — `Cannot find module '@/lib/admin/host'`.

- [ ] **Step 3: Implement**

`lib/admin/host.ts`:
```ts
// The platform admin dashboard lives on its own subdomain (spec §3.1):
// admin.<domain> in production, admin.localhost:<port> locally.
export function isAdminHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return /^admin\.[^.]/i.test(host.trim());
}
```

In `proxy.ts`, add the import and change `proxy()`:
```ts
import { isAdminHost } from "@/lib/admin/host";

function requestHost(request: NextRequest): string | null {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host");
}

export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const { pathname } = request.nextUrl;

  // Admin dashboard (spec §3.1): its own host, never the main site's paths.
  if (isAdminHost(requestHost(request))) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/admin" || pathname.startsWith("/admin/") ? pathname : `/admin${pathname === "/" ? "" : pathname}`;
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    const response = NextResponse.rewrite(url, { request: { headers } });
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const maintenance = maintenanceResponse(request);
  if (maintenance) return maintenance;
  return route(request, requestId);
}
```
(Remove the old body of `proxy()`; `route()` and `maintenanceResponse()` are unchanged. Admin-host API calls do not exist — admin mutations are Server Actions, which post to the page URL and are covered by Next's own origin check.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/pure/admin-host.test.ts tests/security`
Expected: PASS (all security tests, including the existing middleware tests).

- [ ] **Step 5: Commit (user runs)**

```bash
git add lib/admin/host.ts proxy.ts tests/lib/pure/admin-host.test.ts tests/security/admin-routing.test.ts
git commit -m "feat(admin): route the admin subdomain to /admin and hide /admin elsewhere"
```

### Task 1.2: Database foundation for admins

**Files:**
- Create: `supabase/migrations/0047_admin_foundation.sql`
- Modify: `lib/audit.ts` (the `actorType` union)
- Test: `tests/supabase/admin_foundation.test.ts`

**Interfaces:**
- Produces (SQL, service_role only): `public.admin_sign_out_user(p_user_id uuid) returns void`; `public.admin_unlock_couple_login(p_event_id uuid) returns void`; trigger `venue_staff_not_platform_admin` on `venue_staff`; `audit_log.actor_type` accepts `'admin'`.
- Produces (TS): `AuditEntry["actorType"]` includes `"admin"`.

- [ ] **Step 1: Write the failing test** — `tests/supabase/admin_foundation.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let adminUserId: string;
let staffUserId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: "Admin Foundation Venue" }).select("id").single()).data!.id;
  const a = await admin.auth.admin.createUser({ email: `pa-${stamp}@test.local`, password: "admin-password-123", email_confirm: true, app_metadata: { role: "platform_admin" } });
  adminUserId = a.data.user!.id;
  const s = await admin.auth.admin.createUser({ email: `staff-${stamp}@test.local`, password: "staff-password-123", email_confirm: true });
  staffUserId = s.data.user!.id;
  await admin.from("venue_staff").insert({ user_id: staffUserId, venue_id: venueId });
});

afterAll(async () => {
  await admin.auth.admin.deleteUser(adminUserId);
  await admin.auth.admin.deleteUser(staffUserId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("admin foundation (0047)", () => {
  it("never lets a platform admin become venue staff", async () => {
    const { error } = await admin.from("venue_staff").insert({ user_id: adminUserId, venue_id: venueId });
    expect(error?.message).toMatch(/platform admin/i);
  });

  it("accepts admin audit rows", async () => {
    const { error } = await admin.from("audit_log").insert({ actor_type: "admin", actor_id: adminUserId, action: "test_admin_action", venue_id: venueId });
    expect(error).toBeNull();
  });

  it("signs a user out of every session", async () => {
    const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    await c.auth.signInWithPassword({ email: `staff-${stamp}@test.local`, password: "staff-password-123" });
    const refresh = (await c.auth.getSession()).data.session!.refresh_token;
    expect((await admin.rpc("admin_sign_out_user", { p_user_id: staffUserId })).error).toBeNull();
    const again = await createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } }).auth.refreshSession({ refresh_token: refresh });
    expect(again.error).not.toBeNull();
  });

  it("clears a couple lockout", async () => {
    const eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Lock & Test", event_date: "2028-01-10" }).select("id").single()).data!.id;
    await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: `lock-${stamp}`, p_password: "long-enough-99" });
    await admin.from("event_credentials").update({ failed_attempts: 5, locked_until: new Date(Date.now() + 900_000).toISOString() }).eq("event_id", eventId);
    expect((await admin.rpc("admin_unlock_couple_login", { p_event_id: eventId })).error).toBeNull();
    const { data } = await admin.from("event_credentials").select("failed_attempts, locked_until").eq("event_id", eventId).single();
    expect(data).toEqual({ failed_attempts: 0, locked_until: null });
  });

  it("keeps the new functions away from API roles", async () => {
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await anon.rpc("admin_sign_out_user", { p_user_id: staffUserId })).error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run -c vitest.db.config.ts tests/supabase/admin_foundation.test.ts`
Expected: FAIL (staff insert succeeds; `actor_type` check violation; functions missing).

- [ ] **Step 3: Write the migration** — `supabase/migrations/0047_admin_foundation.sql`:
```sql
-- 0047: platform admin foundation (admin dashboard spec §3.2-3.4).

alter table public.audit_log drop constraint audit_log_actor_type_check;
alter table public.audit_log add constraint audit_log_actor_type_check
  check (actor_type in ('staff', 'couple', 'guest', 'system', 'admin'));

-- An admin is never venue staff (spec §3.2).
create or replace function public.venue_staff_not_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if exists (select 1 from auth.users where id = new.user_id and raw_app_meta_data->>'role' = 'platform_admin') then
    raise exception 'A platform admin cannot be venue staff.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.venue_staff_not_platform_admin() from public, anon, authenticated;
create trigger venue_staff_not_platform_admin
  before insert or update of user_id on public.venue_staff
  for each row execute function public.venue_staff_not_platform_admin();

-- Supabase's admin API cannot end another user's sessions by id; this can.
create or replace function public.admin_sign_out_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;
revoke all on function public.admin_sign_out_user(uuid) from public, anon, authenticated;
grant execute on function public.admin_sign_out_user(uuid) to service_role;

create or replace function public.admin_unlock_couple_login(p_event_id uuid)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  update public.event_credentials set failed_attempts = 0, locked_until = null where event_id = p_event_id;
$$;
revoke all on function public.admin_unlock_couple_login(uuid) from public, anon, authenticated;
grant execute on function public.admin_unlock_couple_login(uuid) to service_role;
```
(`auth.sessions` deletion cascades to `auth.refresh_tokens` via `session_id`.)

In `lib/audit.ts` change the union to `actorType: "staff" | "couple" | "guest" | "system" | "admin";`.

- [ ] **Step 4: Apply and test**

Run: `psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f <this task's migration> && npx vitest run -c vitest.db.config.ts tests/supabase/admin_foundation.test.ts tests/supabase/privileges.test.ts tests/supabase/audit_log.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (user runs)**

```bash
git add supabase/migrations/0047_admin_foundation.sql lib/audit.ts tests/supabase/admin_foundation.test.ts
git commit -m "feat(admin): admin audit actor, admin-is-never-staff trigger, sign-out and unlock RPCs"
```

### Task 1.3: `requireAdmin()` and the Server Action wrapper

**Files:**
- Create: `lib/admin/guard.ts`, `lib/admin/actions.ts`
- Test: `tests/supabase/admin_guard.test.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` (`lib/supabase/server.ts`), `recordAudit` (`lib/audit.ts`), `REQUEST_ID_HEADER` (`lib/log.ts`).
- Produces:
  - `type AdminContext = { adminUserId: string; requestId: string | null }`
  - `class AdminAccessError extends Error {}`
  - `checkAdmin(supabase: SupabaseClient): Promise<AdminContext | null>` (testable core)
  - `requireAdmin(): Promise<AdminContext>` — redirects to `/admin/login` when used from a page (`{ page: true }`), throws `AdminAccessError` otherwise: `requireAdmin(options?: { page?: boolean })`.
  - `type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string }`
  - `adminAction<I, O>(schema: ZodType<I>, run: (input: I, ctx: AdminContext) => Promise<{ data: O; audit?: Omit<AuditEntry, "actorType" | "actorId" | "requestId"> }>): (input: unknown) => Promise<ActionResult<O>>`

- [ ] **Step 1: Write the failing test** — `tests/supabase/admin_guard.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkAdmin } from "@/lib/admin/guard";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const password = "admin-password-123";
let adminId: string;
let plainId: string;
let factorId: string;
let secret: string;

// RFC 6238 TOTP (same helper as tests/supabase/mfa_staff.test.ts).
function totp(base32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

beforeAll(async () => {
  adminId = (await admin.auth.admin.createUser({ email: `guard-admin-${stamp}@test.local`, password, email_confirm: true, app_metadata: { role: "platform_admin" } })).data.user!.id;
  plainId = (await admin.auth.admin.createUser({ email: `guard-plain-${stamp}@test.local`, password, email_confirm: true })).data.user!.id;
  const c = await signIn(`guard-admin-${stamp}@test.local`);
  const enrolled = await c.auth.mfa.enroll({ factorType: "totp" });
  factorId = enrolled.data!.id;
  secret = enrolled.data!.totp.secret;
  await c.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
});

afterAll(async () => {
  await admin.auth.admin.deleteUser(adminId);
  await admin.auth.admin.deleteUser(plainId);
});

describe("checkAdmin (spec §3.3)", () => {
  it("accepts a platform admin at aal2", async () => {
    const c = await signIn(`guard-admin-${stamp}@test.local`);
    await c.auth.mfa.challengeAndVerify({ factorId, code: totp(secret, Date.now() + 30_000) });
    expect(await checkAdmin(c)).toMatchObject({ adminUserId: adminId });
  });

  it("refuses the admin at aal1 (password only)", async () => {
    expect(await checkAdmin(await signIn(`guard-admin-${stamp}@test.local`))).toBeNull();
  });

  it("refuses a user without the role", async () => {
    expect(await checkAdmin(await signIn(`guard-plain-${stamp}@test.local`))).toBeNull();
  });

  it("refuses once the role is removed server-side, even with an aal2 token that still claims it", async () => {
    const c = await signIn(`guard-admin-${stamp}@test.local`);
    await c.auth.mfa.challengeAndVerify({ factorId, code: totp(secret, Date.now() + 60_000) });
    await admin.auth.admin.updateUserById(adminId, { app_metadata: { role: null } });
    try {
      expect(await checkAdmin(c)).toBeNull();
    } finally {
      await admin.auth.admin.updateUserById(adminId, { app_metadata: { role: "platform_admin" } });
    }
  });

  it("refuses when signed out", async () => {
    expect(await checkAdmin(createClient(url, anonKey, { auth: { persistSession: false } }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run -c vitest.db.config.ts tests/supabase/admin_guard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/admin/guard.ts`:
```ts
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { REQUEST_ID_HEADER } from "@/lib/log";

export type AdminContext = { adminUserId: string; requestId: string | null };

export class AdminAccessError extends Error {
  constructor() {
    super("Admin access required.");
  }
}

/**
 * Spec §3.3: aal2 in the verified JWT, and the platform_admin role confirmed
 * by the Auth server (not the cookie). Fails closed on any error.
 */
export async function checkAdmin(supabase: SupabaseClient): Promise<AdminContext | null> {
  try {
    const { data: claims } = await supabase.auth.getClaims();
    if (claims?.claims?.aal !== "aal2") return null;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    if (data.user.app_metadata?.role !== "platform_admin") return null;
    return { adminUserId: data.user.id, requestId: null };
  } catch {
    return null;
  }
}

export async function requireAdmin(options: { page?: boolean } = {}): Promise<AdminContext> {
  const ctx = await checkAdmin(await createServerSupabaseClient());
  if (!ctx) {
    if (options.page) redirect("/admin/login");
    throw new AdminAccessError();
  }
  return { ...ctx, requestId: (await headers()).get(REQUEST_ID_HEADER) };
}
```

`lib/admin/actions.ts`:
```ts
import "server-only";
import type { ZodType } from "zod";
import { requireAdmin, AdminAccessError, type AdminContext } from "@/lib/admin/guard";
import { recordAudit, type AuditEntry } from "@/lib/audit";
import { isUserFacingError } from "@/lib/api/handler";
import { errorFields, log } from "@/lib/log";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export const ADMIN_ACTION_FAILED = "Акцијата не успеа.";

type Outcome<O> = { data: O; audit?: Omit<AuditEntry, "actorType" | "actorId" | "requestId"> };

/**
 * Every admin Server Action: guard → validate → run → audit (spec §5).
 * Intentional messages (plain Error) reach the UI; everything else is logged
 * and answered with ADMIN_ACTION_FAILED.
 */
export function adminAction<I, O>(schema: ZodType<I>, run: (input: I, ctx: AdminContext) => Promise<Outcome<O>>) {
  return async (raw: unknown): Promise<ActionResult<O>> => {
    let ctx: AdminContext;
    try {
      ctx = await requireAdmin();
    } catch (err) {
      if (err instanceof AdminAccessError) return { ok: false, error: "Потребна е админ најава." };
      throw err;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Неважечки податоци." };
    try {
      const { data, audit } = await run(parsed.data, ctx);
      if (audit) await recordAudit({ ...audit, actorType: "admin", actorId: ctx.adminUserId, requestId: ctx.requestId });
      return { ok: true, data };
    } catch (err) {
      if (isUserFacingError(err)) return { ok: false, error: err.message };
      log("error", "admin_action_failed", { request_id: ctx.requestId, ...errorFields(err) });
      return { ok: false, error: ADMIN_ACTION_FAILED };
    }
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run -c vitest.db.config.ts tests/supabase/admin_guard.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit (user runs)**

```bash
git add lib/admin/guard.ts lib/admin/actions.ts tests/supabase/admin_guard.test.ts
git commit -m "feat(admin): requireAdmin guard (aal2 + server-confirmed role) and admin action wrapper"
```

### Task 1.4: Admin login, shell and make-admin script

**Files:**
- Create: `app/admin/layout.tsx`, `app/admin/login/page.tsx`, `app/admin/(panel)/layout.tsx`, `app/admin/(panel)/page.tsx`, `components/admin/AdminShell.tsx`, `components/admin/nav.ts`, `components/admin/AdminLogin.tsx`, `scripts/make-admin.mjs`
- Test: `tests/components/admin/AdminLogin.test.tsx`, `tests/security/admin-static.test.ts`

**Interfaces:**
- Consumes: `requireAdmin({ page: true })`, `MfaCodeForm`, `pendingSecondFactor` (`components/auth/MfaCodeForm.tsx`), `createBrowserSupabaseClient`, `AuthScreen`.
- Produces: `ADMIN_NAV: { href: string; icon: string; label: string }[]` (hrefs `/admin`, `/admin/venues`, `/admin/events`, `/admin/plans`, `/admin/messages`, `/admin/audit`, `/admin/system`); `<AdminShell>{children}</AdminShell>`.

Admin-host links: the proxy rewrites `admin.<domain>/venues` to `/admin/venues`, and a link to `/admin/venues` on the admin host is also served (Task 1.1 keeps `/admin` paths as-is), so all admin links use the `/admin/...` form.

- [ ] **Step 1: Write the failing tests**

`tests/components/admin/AdminLogin.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const auth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  getUser: vi.fn(),
  mfa: { getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn(), challengeAndVerify: vi.fn() },
};
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => ({ auth }) }));

import { AdminLogin } from "@/components/admin/AdminLogin";

function signIn() {
  fireEvent.change(screen.getByLabelText("Е-пошта"), { target: { value: "owner@example.com" } });
  fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "admin-password-123" } });
  fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
});

describe("AdminLogin", () => {
  it("refuses an account without the admin role and signs it out", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null });
    render(<AdminLogin />);
    signIn();
    expect(await screen.findByText("Оваа сметка нема админ пристап.")).toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("asks for the TOTP code when the admin has a factor", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { app_metadata: { role: "platform_admin" } } }, error: null });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: "f1", status: "verified" }] } });
    render(<AdminLogin />);
    signIn();
    expect(await screen.findByLabelText("Код од апликацијата")).toBeInTheDocument();
  });

  it("sends an admin without a factor to mandatory enrolment", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { app_metadata: { role: "platform_admin" } } }, error: null });
    render(<AdminLogin />);
    signIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/login/mfa"));
  });
});
```

`tests/security/admin-static.test.ts` (enforces spec §3.3 and D2 by reading the source):
```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const adminFiles = [...files("app/admin"), ...files("lib/admin"), ...files("components/admin")];

const PRIVATE_TABLES = [
  // Tables owned by sessions 2–4 (MASTER §7) are private too.
  "event_seat_assignments", "event_photos", "event_greetings", "event_co_organizers", "event_reminders",
  "event_guests", "event_notes", "event_budget_items", "event_checklist_items", "event_checklist_subtasks",
  "event_agenda_items", "event_locations", "event_invitations", "event_custom_menu_items",
  "event_menu_item_quantities", "couple_sessions", "event_credentials",
];
const PRIVATE_COLUMNS = ["guest_name", "contact_email", "contact_email_2", "contact_phone"];

describe("admin code boundaries", () => {
  it("never reads guest or couple planning data (spec D2)", () => {
    for (const f of adminFiles) {
      const src = readFileSync(f, "utf8");
      for (const t of [...PRIVATE_TABLES, ...PRIVATE_COLUMNS]) {
        expect(src.includes(`"${t}"`) || src.includes(`'${t}'`) || new RegExp(`\\b${t}\\b`).test(src.replace(/\/\/.*$/gm, "")), `${f} references ${t}`).toBe(false);
      }
    }
  });

  it("guards every Server Action module with adminAction", () => {
    for (const f of adminFiles.filter((f) => f.endsWith("actions.ts"))) {
      const src = readFileSync(f, "utf8");
      expect(src.startsWith('"use server";'), `${f} must start with "use server"`).toBe(true);
      const exported = src.match(/export const \w+ = /g) ?? [];
      const wrapped = src.match(/export const \w+ = adminAction\(/g) ?? [];
      expect(wrapped.length, `${f}: every exported action uses adminAction`).toBe(exported.length);
      expect(/export (async )?function/.test(src), `${f}: no unwrapped exported functions`).toBe(false);
    }
  });

  it("guards every admin page layout", () => {
    const layout = readFileSync("app/admin/(panel)/layout.tsx", "utf8");
    expect(layout).toContain("requireAdmin({ page: true })");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/components/admin/AdminLogin.test.tsx tests/security/admin-static.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`app/admin/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "@/app/venue/panel.css";

export const metadata: Metadata = { title: "Админ — КАДЕ СУМ?", robots: { index: false, follow: false } };

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

`components/admin/AdminLogin.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { MfaCodeForm, pendingSecondFactor } from "@/components/auth/MfaCodeForm";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Неточна е-пошта или лозинка.");
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (data.user?.app_metadata?.role !== "platform_admin") {
        await supabase.auth.signOut({ scope: "local" });
        setError("Оваа сметка нема админ пристап.");
        return;
      }
      const pending = await pendingSecondFactor(supabase);
      if (pending) {
        setFactorId(pending);
        return;
      }
      // No verified factor yet: TOTP enrolment is mandatory for admins.
      router.push("/admin/login/mfa");
    } catch {
      setError("Акцијата не успеа.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (factorId) {
    return <MfaCodeForm factorId={factorId} onVerified={() => router.push("/admin")} onBack={() => setFactorId(null)} />;
  }

  return (
    <AuthScreen eyebrow="Админ" tagline="Управување со платформата." title="Најава">
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="lab-s" htmlFor="admin-email">Е-пошта</label>
          <input id="admin-email" className="fld" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="auth-field">
          <label className="lab-s" htmlFor="admin-password">Лозинка</label>
          <input id="admin-password" className="fld" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
          {isSubmitting ? "Се најавува..." : "Најави се"}
        </button>
      </form>
    </AuthScreen>
  );
}
```

`app/admin/login/page.tsx`:
```tsx
import { AdminLogin } from "@/components/admin/AdminLogin";

export default function AdminLoginPage() {
  return <AdminLogin />;
}
```

`app/admin/login/mfa/page.tsx` (mandatory enrolment, reuses the staff MFA panel):
```tsx
import { MfaSettings } from "@/components/venue/dashboard/MfaSettings";

export default function AdminMfaEnrolPage() {
  return (
    <div className="vp" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <p className="muted">Двофакторската автентикација е задолжителна за админ пристап. Вклучете ја, па најавете се повторно.</p>
        <MfaSettings />
        <p style={{ marginTop: 16 }}><a className="btn btn-ghost" href="/admin/login">Кон најава</a></p>
      </div>
    </div>
  );
}
```
(Add `app/admin/login/mfa/page.tsx` to the task's files. `MfaSettings` enrolment works at aal1 for a user without factors; after enabling, signing in again yields aal2.)

`components/admin/nav.ts`:
```ts
export type AdminNavItem = { href: string; icon: string; label: string };

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", icon: "home", label: "Преглед" },
  { href: "/admin/venues", icon: "tables", label: "Сали" },
  { href: "/admin/events", icon: "cal-dot", label: "Настани" },
  { href: "/admin/plans", icon: "chart", label: "Нивоа" },
  { href: "/admin/messages", icon: "msg", label: "Контакт пораки" },
  { href: "/admin/audit", icon: "book", label: "Audit log" },
  { href: "/admin/system", icon: "life", label: "Систем" },
];

export function matchAdminNav(pathname: string): AdminNavItem {
  return (
    [...ADMIN_NAV].sort((a, b) => b.href.length - a.href.length).find((i) => (i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href))) ??
    ADMIN_NAV[0]
  );
}
```

`components/admin/AdminShell.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconSprite } from "@/components/venue/shell/IconSprite";
import { Icon } from "@/components/venue/shell/Icon";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ADMIN_NAV, matchAdminNav } from "./nav";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = matchAdminNav(pathname);

  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut({ scope: "local" });
    router.push("/admin/login");
  }

  return (
    <div className="vp app">
      <IconSprite />
      <aside className="side">
        <div className="brand"><b>КАДЕ СУМ?</b> <span className="muted">Админ</span></div>
        <nav>
          {ADMIN_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={item.href === active.href ? "on" : ""} aria-current={item.href === active.href ? "page" : undefined}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <button type="button" className="btn btn-ghost" onClick={signOut} style={{ margin: "12px 20px" }}>Одјави се</button>
      </aside>
      <main className="main">
        <header className="top"><h1 className="page-t">{active.label.toUpperCase()}</h1></header>
        {children}
      </main>
    </div>
  );
}
```

`app/admin/(panel)/layout.tsx`:
```tsx
import { requireAdmin } from "@/lib/admin/guard";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin({ page: true });
  return <AdminShell>{children}</AdminShell>;
}
```

`app/admin/(panel)/page.tsx` (replaced in Task 3.2):
```tsx
export default function AdminOverviewPage() {
  return <div className="wrap"><section className="panel"><p style={{ padding: 20 }}>Админ панел.</p></section></div>;
}
```

`scripts/make-admin.mjs`:
```js
// Marks one Supabase Auth user as the platform admin (spec §3.2).
//   node --env-file=.env.local scripts/make-admin.mjs owner@example.com
// Creates the user (with a password-reset email) if missing. Refuses venue staff.
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error("Usage: node --env-file=<env> scripts/make-admin.mjs <email>");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 1000) break;
}

if (user) {
  const { data: staff } = await admin.from("venue_staff").select("venue_id").eq("user_id", user.id);
  if (staff?.length) {
    console.error("This user is venue staff; an admin must be a separate account.");
    process.exit(1);
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, role: "platform_admin" } });
  if (error) throw error;
  console.log(`${email} is now the platform admin.`);
} else {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: "platform_admin" } });
  if (error) throw error;
  await admin.auth.resetPasswordForEmail(email);
  console.log(`Created ${email} (${data.user.id}) as platform admin; a password link was emailed.`);
}
console.log("Next: sign in at admin.<domain>/login and enable two-factor authentication.");
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run tests/components/admin tests/security && npm run typecheck && npm run lint && npm run build`
Expected: PASS; build lists `/admin`, `/admin/login`, `/admin/login/mfa`.

- [ ] **Step 5: Commit (user runs)**

```bash
git add app/admin components/admin scripts/make-admin.mjs tests/components/admin tests/security/admin-static.test.ts
git commit -m "feat(admin): admin login with mandatory TOTP, guarded shell, make-admin script"
```

### Task 1.5: Phase 1 gate

- [ ] **Step 1:** Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:db && npx playwright test` — Expected: all PASS.
- [ ] **Step 2:** Manual: `node --env-file=.env.test.local scripts/make-admin.mjs owner@example.com`, set a password via the local Mailpit link (`http://127.0.0.1:54324`), open `http://admin.localhost:3000/login` (`npm run dev` with `.env.test.local` values), enrol TOTP, sign in again with the code, see the admin shell; open `http://localhost:3000/admin` → 404.
- [ ] **Step 3: Commit (user runs)** — nothing new; confirm `git status` is clean for Phase 1 files.

---

## Phase 2 — Entitlements

### Task 2.1: Feature catalogue

**Files:**
- Create: `lib/entitlements/features.ts`
- Test: `tests/lib/pure/features.test.ts`

**Interfaces:**
- Produces:
```ts
export type FeatureScope = "event" | "venue";
export type FeatureKind = "switch" | "limit";
export type FeatureKey =
  | "invitation" | "invitation_all_templates" | "invitation_photo" | "seating" | "custom_menu"
  | "budget" | "checklist" | "agenda" | "locations" | "notes" | "max_guests"
  | "reservations" | "floor_plan" | "showcase_photos" | "max_rooms" | "max_active_events" | "reports"
  | "photo_album" | "guest_greetings" | "video_greetings" | "reminders" | "personal_invite_links" | "print_qr"
  | "storage_gb" | "photo_retention_days" | "co_organizers";
export type FeatureDef = { key: FeatureKey; label: string; scope: FeatureScope; kind: FeatureKind };
export const FEATURES: readonly FeatureDef[];
export const FEATURE_KEYS: readonly FeatureKey[];
export function featureDef(key: FeatureKey): FeatureDef;
export type ResolvedFeature = { enabled: boolean; limit: number | null };   // limit null = unlimited
export type FeatureMap = Record<FeatureKey, ResolvedFeature>;
export const LOCKED_MESSAGE = "Оваа функција не е вклучена во вашиот пакет.";
export const BASIC_TEMPLATE_IDS: readonly string[];  // first two of INVITATION_TEMPLATES
```

- [ ] **Step 1: Write the failing test**
```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { FEATURES, FEATURE_KEYS, featureDef, BASIC_TEMPLATE_IDS } from "@/lib/entitlements/features";
import { INVITATION_TEMPLATES } from "@/lib/couple/invitation-templates";

describe("feature catalogue (spec §4.1)", () => {
  it("has the 26 features with unique keys and Macedonian labels", () => {
    expect(FEATURE_KEYS).toHaveLength(26);
    expect(new Set(FEATURE_KEYS).size).toBe(26);
    for (const f of FEATURES) expect(f.label.length).toBeGreaterThan(2);
    expect(featureDef("max_guests")).toMatchObject({ scope: "event", kind: "limit" });
    expect(featureDef("reservations")).toMatchObject({ scope: "venue", kind: "switch" });
  });

  it("matches the key list in the database check constraint (migration 0048)", () => {
    const sql = readFileSync("supabase/migrations/0048_plans_and_entitlements.sql", "utf8");
    const listed = sql.match(/feature_key in \(([^)]+)\)/)![1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1));
    expect([...listed].sort()).toEqual([...FEATURE_KEYS].sort());
  });

  it("treats the first two invitation templates as basic", () => {
    expect(BASIC_TEMPLATE_IDS).toEqual(INVITATION_TEMPLATES.slice(0, 2).map((t) => t.id));
  });
});
```
(The migration check will stay failing until Task 2.2 — expected; run only the first and third tests now with `-t "catalogue has|basic"` or accept the one failure until 2.2.)

- [ ] **Step 2: Run** `npx vitest run tests/lib/pure/features.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `lib/entitlements/features.ts`:
```ts
import { INVITATION_TEMPLATES } from "@/lib/couple/invitation-templates";

// The fixed catalogue of lockable features (admin dashboard spec §4.1).
// Plans and overrides are data; this list is code.

export type FeatureScope = "event" | "venue";
export type FeatureKind = "switch" | "limit";
export type FeatureKey =
  | "invitation" | "invitation_all_templates" | "invitation_photo" | "seating" | "custom_menu"
  | "budget" | "checklist" | "agenda" | "locations" | "notes" | "max_guests"
  | "reservations" | "floor_plan" | "showcase_photos" | "max_rooms" | "max_active_events" | "reports"
  | "photo_album" | "guest_greetings" | "video_greetings" | "reminders" | "personal_invite_links" | "print_qr"
  | "storage_gb" | "photo_retention_days" | "co_organizers";

export type FeatureDef = { key: FeatureKey; label: string; scope: FeatureScope; kind: FeatureKind };

export const FEATURES: readonly FeatureDef[] = [
  { key: "invitation", label: "Дигитална покана и RSVP", scope: "event", kind: "switch" },
  { key: "invitation_all_templates", label: "Сите дизајни на покани", scope: "event", kind: "switch" },
  { key: "invitation_photo", label: "Фотографија на поканата", scope: "event", kind: "switch" },
  { key: "seating", label: "Распоред на седење", scope: "event", kind: "switch" },
  { key: "custom_menu", label: "Сопствено мени", scope: "event", kind: "switch" },
  { key: "budget", label: "Буџет", scope: "event", kind: "switch" },
  { key: "checklist", label: "Чеклиста", scope: "event", kind: "switch" },
  { key: "agenda", label: "Агенда", scope: "event", kind: "switch" },
  { key: "locations", label: "Локации", scope: "event", kind: "switch" },
  { key: "notes", label: "Белешки", scope: "event", kind: "switch" },
  { key: "max_guests", label: "Максимален број гости", scope: "event", kind: "limit" },
  { key: "reservations", label: "Резервации", scope: "venue", kind: "switch" },
  { key: "floor_plan", label: "Уредувач на распоред на сала", scope: "venue", kind: "switch" },
  { key: "showcase_photos", label: "Фотографии од настани", scope: "venue", kind: "switch" },
  { key: "max_rooms", label: "Максимален број простории", scope: "venue", kind: "limit" },
  { key: "max_active_events", label: "Максимален број активни настани", scope: "venue", kind: "limit" },
  { key: "reports", label: "Извештаи", scope: "venue", kind: "switch" },
  { key: "photo_album", label: "Албум со фотографии од гостите", scope: "event", kind: "switch" },
  { key: "guest_greetings", label: "Честитки од гостите", scope: "event", kind: "switch" },
  { key: "video_greetings", label: "Видео честитки", scope: "event", kind: "switch" },
  { key: "reminders", label: "Потсетници до гостите", scope: "event", kind: "switch" },
  { key: "personal_invite_links", label: "Персонални линкови за покана", scope: "event", kind: "switch" },
  { key: "print_qr", label: "Печатење QR кодови", scope: "event", kind: "switch" },
  { key: "storage_gb", label: "Простор за фотографии (GB)", scope: "event", kind: "limit" },
  { key: "photo_retention_days", label: "Чување на фотографии (денови)", scope: "event", kind: "limit" },
  { key: "co_organizers", label: "Дополнителни организатори", scope: "event", kind: "limit" },
];

export const FEATURE_KEYS: readonly FeatureKey[] = FEATURES.map((f) => f.key);

export function featureDef(key: FeatureKey): FeatureDef {
  return FEATURES.find((f) => f.key === key)!;
}

export type ResolvedFeature = { enabled: boolean; limit: number | null };
export type FeatureMap = Record<FeatureKey, ResolvedFeature>;

export const LOCKED_MESSAGE = "Оваа функција не е вклучена во вашиот пакет.";

export const BASIC_TEMPLATE_IDS: readonly string[] = INVITATION_TEMPLATES.slice(0, 2).map((t) => t.id);
```

- [ ] **Step 4: Run** `npx vitest run tests/lib/pure/features.test.ts -t "26 features|basic"` — Expected: PASS (the migration test passes after Task 2.2).

- [ ] **Step 5: Commit (user runs)**
```bash
git add lib/entitlements/features.ts tests/lib/pure/features.test.ts
git commit -m "feat(entitlements): feature catalogue"
```

### Task 2.2: Plans, overrides, resolution function, blocked venues

**Files:**
- Create: `supabase/migrations/0048_plans_and_entitlements.sql`
- Modify: `tests/supabase/rls_guard.test.ts` (add `plans`, `plan_features`, `venue_feature_overrides`, `event_feature_overrides` to SERVICE_ROLE_ONLY_TABLES), `tests/supabase/privacy-classification.ts` (classify every new column as `"none"` except `venue_feature_overrides.note`, `event_feature_overrides.note`, `venues.blocked_reason` → `"context"`)
- Test: `tests/supabase/entitlements_resolution.test.ts`

**Interfaces:**
- Produces (SQL):
  - tables `plans`, `plan_features`, `venue_feature_overrides`, `event_feature_overrides`; columns `venues.plan_id uuid not null`, `venues.blocked_at timestamptz`, `venues.blocked_reason text`.
  - `public.effective_features(p_venue_id uuid, p_event_id uuid default null) returns table(feature_key text, enabled boolean, limit_value integer)` — execute: service_role, authenticated (staff of that venue only).
  - `public.event_has_feature(p_event_id uuid, p_key text) returns boolean`, `public.venue_has_feature(p_venue_id uuid, p_key text) returns boolean`, `public.feature_limit(p_venue_id uuid, p_event_id uuid, p_key text) returns integer` (null = unlimited) — service_role only (triggers call them as definer).
  - `provision_venue` assigns the default plan; `is_venue_staff_for` also requires `blocked_at is null`.

- [ ] **Step 1: Write the failing test** — `tests/supabase/entitlements_resolution.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let planId: string;
let venueId: string;
let eventId: string;

async function resolved(venue: string, event: string | null) {
  const { data, error } = await admin.rpc("effective_features", { p_venue_id: venue, p_event_id: event });
  if (error) throw error;
  return Object.fromEntries((data as { feature_key: string; enabled: boolean; limit_value: number | null }[]).map((r) => [r.feature_key, { enabled: r.enabled, limit: r.limit_value }]));
}

beforeAll(async () => {
  planId = (await admin.from("plans").insert({ name: `Basic ${Date.now()}`, sort_order: 10 }).select("id").single()).data!.id;
  await admin.from("plan_features").insert([
    { plan_id: planId, feature_key: "invitation", enabled: true },
    { plan_id: planId, feature_key: "seating", enabled: false },
    { plan_id: planId, feature_key: "max_guests", enabled: true, limit_value: 150 },
    { plan_id: planId, feature_key: "reservations", enabled: false },
  ]);
  venueId = (await admin.from("venues").insert({ name: "Entitlements Venue", plan_id: planId }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Ent & Test", event_date: "2028-02-01" }).select("id").single()).data!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("effective_features (spec §4.3)", () => {
  it("takes the plan's values, and locks anything the plan does not list", async () => {
    const f = await resolved(venueId, eventId);
    expect(f.invitation).toEqual({ enabled: true, limit: null });
    expect(f.seating).toEqual({ enabled: false, limit: null });
    expect(f.max_guests).toEqual({ enabled: true, limit: 150 });
    expect(f.budget).toEqual({ enabled: false, limit: 0 });
    expect(Object.keys(f)).toHaveLength(26);
  });

  it("applies a venue override over the plan", async () => {
    await admin.from("venue_feature_overrides").insert({ venue_id: venueId, feature_key: "reservations", enabled: true, note: "договор" });
    expect((await resolved(venueId, null)).reservations.enabled).toBe(true);
  });

  it("applies an event override over the venue and plan, including a changed limit", async () => {
    await admin.from("event_feature_overrides").insert([
      { event_id: eventId, feature_key: "seating", enabled: true, note: "доплата" },
      { event_id: eventId, feature_key: "max_guests", limit_override: true, limit_value: 400 },
    ]);
    const f = await resolved(venueId, eventId);
    expect(f.seating.enabled).toBe(true);
    expect(f.max_guests).toEqual({ enabled: true, limit: 400 });
  });

  it("an event override with limit_override and null limit means unlimited", async () => {
    await admin.from("event_feature_overrides").update({ limit_value: null }).eq("event_id", eventId).eq("feature_key", "max_guests");
    expect((await resolved(venueId, eventId)).max_guests.limit).toBeNull();
  });

  it("without an event, event-scope features resolve from venue override → plan", async () => {
    expect((await resolved(venueId, null)).seating.enabled).toBe(false);
  });

  it("gives existing and new venues the default plan with everything unlocked", async () => {
    const { data: def } = await admin.from("plans").select("id").eq("is_default", true).single();
    const { data: fresh } = await admin.rpc("provision_venue", { p_user_id: (await admin.auth.admin.createUser({ email: `plan-${Date.now()}@test.local`, password: "plan-password-1", email_confirm: true })).data.user!.id, p_venue_name: "Fresh Venue" });
    const { data: v } = await admin.from("venues").select("plan_id").eq("id", fresh).single();
    expect(v!.plan_id).toBe(def!.id);
    const f = await resolved(fresh as string, null);
    for (const [k, r] of Object.entries(f)) expect(r.enabled, k).toBe(true);
    expect(f.max_rooms.limit).toBeNull();
    expect(f.storage_gb.limit).toBe(5);
    expect(f.photo_retention_days.limit).toBe(15);
  });

  it("refuses an unknown feature key", async () => {
    const { error } = await admin.from("plan_features").insert({ plan_id: planId, feature_key: "teleport", enabled: true });
    expect(error?.code).toBe("23514");
  });

  it("allows only one default plan", async () => {
    const { error } = await admin.from("plans").insert({ name: `Second default ${Date.now()}`, is_default: true });
    expect(error?.code).toBe("23505");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run -c vitest.db.config.ts tests/supabase/entitlements_resolution.test.ts` — Expected: FAIL (tables missing).

- [ ] **Step 3: Write the migration** — `supabase/migrations/0048_plans_and_entitlements.sql`:
```sql
-- 0048: plans (tiers) and feature entitlements (admin dashboard spec §4).

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 100),
  description text check (description is null or char_length(description) <= 1000),
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index plans_single_default on public.plans (is_default) where is_default;

create table public.plan_features (
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null check (feature_key in (
    'invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
    'budget','checklist','agenda','locations','notes','max_guests',
    'reservations','floor_plan','showcase_photos','max_rooms','max_active_events','reports',
    'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
    'storage_gb','photo_retention_days','co_organizers')),
  enabled boolean not null,
  limit_value integer check (limit_value is null or limit_value >= 0),
  primary key (plan_id, feature_key)
);

create table public.venue_feature_overrides (
  venue_id uuid not null references public.venues(id) on delete cascade,
  feature_key text not null check (feature_key in (
    'invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
    'budget','checklist','agenda','locations','notes','max_guests',
    'reservations','floor_plan','showcase_photos','max_rooms','max_active_events','reports',
    'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
    'storage_gb','photo_retention_days','co_organizers')),
  enabled boolean,
  limit_override boolean not null default false,
  limit_value integer check (limit_value is null or limit_value >= 0),
  note text check (note is null or char_length(note) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (venue_id, feature_key)
);

create table public.event_feature_overrides (
  event_id uuid not null references public.events(id) on delete cascade,
  feature_key text not null check (feature_key in (
    'invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
    'budget','checklist','agenda','locations','notes','max_guests',
    'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
    'storage_gb','photo_retention_days','co_organizers')),
  enabled boolean,
  limit_override boolean not null default false,
  limit_value integer check (limit_value is null or limit_value >= 0),
  note text check (note is null or char_length(note) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (event_id, feature_key)
);

do $$
begin
  alter table public.plans enable row level security;
  alter table public.plan_features enable row level security;
  alter table public.venue_feature_overrides enable row level security;
  alter table public.event_feature_overrides enable row level security;
end $$;
revoke all on public.plans, public.plan_features, public.venue_feature_overrides, public.event_feature_overrides from anon, authenticated;
grant all on public.plans, public.plan_features, public.venue_feature_overrides, public.event_feature_overrides to service_role;

-- Default plan: everything unlocked, no limits (existing behaviour, spec §4.2).
insert into public.plans (name, description, sort_order, is_default)
values ('Стандарден', 'Сите функции отклучени, без лимити.', 0, true);
insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
select p.id, k, true, case k when 'storage_gb' then 5 when 'photo_retention_days' then 15 else null end
from public.plans p,
     unnest(array['invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
                  'budget','checklist','agenda','locations','notes','max_guests',
                  'reservations','floor_plan','showcase_photos','max_rooms','max_active_events','reports',
                  'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
                  'storage_gb','photo_retention_days','co_organizers']) as k
where p.is_default;

alter table public.venues add column plan_id uuid references public.plans(id) on delete restrict;
update public.venues set plan_id = (select id from public.plans where is_default);
alter table public.venues alter column plan_id set not null;
create index venues_plan_id_idx on public.venues (plan_id);

alter table public.venues
  add column blocked_at timestamptz,
  add column blocked_reason text check (blocked_reason is null or char_length(blocked_reason) <= 1000);

-- Staff never change plan or block state (they keep UPDATE on venues for the name).
create or replace function public.venues_protect_admin_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() in ('anon', 'authenticated')
     and (new.plan_id is distinct from old.plan_id or new.blocked_at is distinct from old.blocked_at
          or new.blocked_reason is distinct from old.blocked_reason) then
    raise exception 'Only the platform admin can change the plan or block state.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.venues_protect_admin_columns() from public, anon, authenticated;
create trigger venues_protect_admin_columns before update on public.venues
  for each row execute function public.venues_protect_admin_columns();

-- New venues get the default plan.
create or replace function public.provision_venue(p_user_id uuid, p_venue_name text)
returns uuid
language plpgsql
set search_path = public, pg_temp
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
  return v_venue_id;
end;
$$;

-- Blocked venues (spec D8): staff see nothing through RLS.
create or replace function public.is_venue_staff_for(target_venue_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from venue_staff s join venues v on v.id = s.venue_id
    where s.user_id = auth.uid() and s.venue_id = target_venue_id and v.blocked_at is null
  )
  and public.staff_mfa_satisfied();
$$;

-- Resolution (spec §4.3): event override → venue override → plan → locked.
create or replace function public.effective_features(p_venue_id uuid, p_event_id uuid default null)
returns table(feature_key text, enabled boolean, limit_value integer)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' and not public.is_venue_staff_for(p_venue_id) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  return query
  with keys(k) as (
    select unnest(array['invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
                        'budget','checklist','agenda','locations','notes','max_guests',
                        'reservations','floor_plan','showcase_photos','max_rooms','max_active_events','reports',
                  'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
                  'storage_gb','photo_retention_days','co_organizers'])
  ),
  plan_row as (select plan_id from venues where id = p_venue_id)
  select keys.k,
    coalesce(eo.enabled, vo.enabled, pf.enabled, false),
    case
      when eo.limit_override then eo.limit_value
      when vo.limit_override then vo.limit_value
      when pf.plan_id is not null then pf.limit_value
      else 0
    end
  from keys
  left join plan_features pf on pf.plan_id = (select plan_id from plan_row) and pf.feature_key = keys.k
  left join venue_feature_overrides vo on vo.venue_id = p_venue_id and vo.feature_key = keys.k
  left join event_feature_overrides eo on p_event_id is not null and eo.event_id = p_event_id and eo.feature_key = keys.k;
end;
$$;
revoke all on function public.effective_features(uuid, uuid) from public, anon;
grant execute on function public.effective_features(uuid, uuid) to authenticated, service_role;

create or replace function public.event_has_feature(p_event_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((select f.enabled from public.effective_features((select venue_id from events where id = p_event_id), p_event_id) f where f.feature_key = p_key), false);
$$;

create or replace function public.venue_has_feature(p_venue_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((select f.enabled from public.effective_features(p_venue_id, null) f where f.feature_key = p_key), false);
$$;

create or replace function public.feature_limit(p_venue_id uuid, p_event_id uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select f.limit_value from public.effective_features(p_venue_id, p_event_id) f where f.feature_key = p_key;
$$;

revoke all on function public.event_has_feature(uuid, text) from public, anon, authenticated;
revoke all on function public.venue_has_feature(uuid, text) from public, anon, authenticated;
revoke all on function public.feature_limit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.event_has_feature(uuid, text) to service_role;
grant execute on function public.venue_has_feature(uuid, text) to service_role;
grant execute on function public.feature_limit(uuid, uuid, text) to service_role;
```
Note: `event_has_feature`/`venue_has_feature`/`feature_limit` are `security definer` owned by `postgres`, so inside them `auth.role()` is still the caller's role; `effective_features` checks `is_venue_staff_for` for non-service callers. Triggers (Task 2.3) call these helpers — a staff user's browser insert therefore passes the staff check for their own venue. Couple routes use the service role.

- [ ] **Step 4: Apply and test**

Run: `psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f <this task's migration> && npx vitest run -c vitest.db.config.ts tests/supabase/entitlements_resolution.test.ts tests/supabase/rls_guard.test.ts tests/supabase/privileges.test.ts tests/supabase/privacy_guard.test.ts tests/supabase/mfa_staff.test.ts tests/supabase/rls_isolation.test.ts && npx vitest run tests/lib/pure/features.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (user runs)**
```bash
git add supabase/migrations/0048_plans_and_entitlements.sql tests/supabase/entitlements_resolution.test.ts tests/supabase/rls_guard.test.ts tests/supabase/privacy-classification.ts
git commit -m "feat(entitlements): plans, overrides, resolution function, default plan, blocked venues"
```

### Task 2.3: Enforcement triggers

**Files:**
- Create: `supabase/migrations/0049_entitlement_enforcement.sql`
- Modify: `lib/api/handler.ts` (`isUserFacingError`)
- Test: `tests/supabase/entitlements_enforcement.test.ts`

**Interfaces:**
- Consumes: `event_has_feature`, `venue_has_feature`, `feature_limit` (Task 2.2).
- Produces: triggers raising `P0001` with the Global Constraints messages; `isUserFacingError(err)` returns true for objects with `code === "P0001"` and a `message` (so trigger messages reach users).

Triggers:
| Table | When | Check |
|---|---|---|
| `event_guests` | before insert | `count(*) where event_id` `>=` `feature_limit(venue, event, 'max_guests')` → guest limit message |
| `rooms` | before insert | count per venue `>=` `max_rooms` → rooms message |
| `events` | before insert, and before update of `status` when moving from inactive to active | count of events with status not in (`completed`,`cancelled`) `>=` `max_active_events` → events message |
| `reservations` | before insert or update | not `venue_has_feature(venue,'reservations')` → locked message |
| `room_fixed_elements`, `room_layout_elements` | before insert or update | not `floor_plan` for the room's venue → locked |
| `event_showcase_photos` | before insert | not `showcase_photos` → locked |
| `event_layout_elements` | before insert or update | not `event_has_feature(event,'seating')` → locked |
| `event_invitations` | before insert or update | not `invitation` → locked; `template_id` changed to a non-basic template and not `invitation_all_templates` → locked; `photo_path` changed to non-null and not `invitation_photo` → locked |
| `event_custom_menu_items` | before insert | not `custom_menu` → locked |

Deletes are never checked (spec D7).

- [ ] **Step 1: Write the failing test** — `tests/supabase/entitlements_enforcement.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const LOCKED = "Оваа функција не е вклучена во вашиот пакет.";
let planId: string;
let venueId: string;
let eventId: string;
let roomId: string;

beforeAll(async () => {
  planId = (await admin.from("plans").insert({ name: `Tight ${Date.now()}` }).select("id").single()).data!.id;
  await admin.from("plan_features").insert([
    { plan_id: planId, feature_key: "max_guests", enabled: true, limit_value: 2 },
    { plan_id: planId, feature_key: "max_rooms", enabled: true, limit_value: 1 },
    { plan_id: planId, feature_key: "max_active_events", enabled: true, limit_value: 1 },
    { plan_id: planId, feature_key: "invitation", enabled: true },
  ]);
  venueId = (await admin.from("venues").insert({ name: "Tight Venue", plan_id: planId }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Tight & Test", event_date: "2028-03-01" }).select("id").single()).data!.id;
  roomId = (await admin.from("rooms").insert({ venue_id: venueId, name: "Only room" }).select("id").single()).data!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("limits (spec §4.4)", () => {
  it("refuses the guest over the limit with the Macedonian message", async () => {
    expect((await admin.from("event_guests").insert({ event_id: eventId, full_name: "Прв" })).error).toBeNull();
    expect((await admin.from("event_guests").insert({ event_id: eventId, full_name: "Втор" })).error).toBeNull();
    const { error } = await admin.from("event_guests").insert({ event_id: eventId, full_name: "Трет" });
    expect(error?.code).toBe("P0001");
    expect(error?.message).toBe("Достигнат е лимитот од 2 гости за овој настан.");
  });

  it("keeps existing guests over a lowered limit readable and updatable (D7)", async () => {
    await admin.from("plan_features").update({ limit_value: 1 }).eq("plan_id", planId).eq("feature_key", "max_guests");
    const { data } = await admin.from("event_guests").select("id").eq("event_id", eventId);
    expect(data).toHaveLength(2);
    expect((await admin.from("event_guests").update({ rsvp_status: "confirmed" }).eq("event_id", eventId)).error).toBeNull();
  });

  it("refuses a second room and a second active event", async () => {
    expect((await admin.from("rooms").insert({ venue_id: venueId, name: "Two" })).error?.message).toBe("Достигнат е лимитот од 1 простории.");
    expect((await admin.from("events").insert({ venue_id: venueId, couple_names: "Second & Test", event_date: "2028-03-02" })).error?.message).toBe("Достигнат е лимитот од 1 активни настани.");
  });

  it("counts only active events", async () => {
    await admin.from("events").update({ status: "completed" }).eq("id", eventId);
    expect((await admin.from("events").insert({ venue_id: venueId, couple_names: "Third & Test", event_date: "2028-03-03" })).error).toBeNull();
    await admin.from("events").update({ status: "preparation" }).eq("id", eventId).select();
    const { error } = await admin.from("events").update({ status: "confirmed" }).eq("id", eventId);
    expect(error?.message).toBe("Достигнат е лимитот од 1 активни настани.");
  });
});

describe("locked features (spec §4.4)", () => {
  it("refuses reservations, floor plan, showcase, seating and custom menu writes when locked", async () => {
    const r = await admin.from("reservations").insert({ venue_id: venueId, room_id: roomId, guest_name: "X", phone: "070", date: "2028-03-05", start_time: "12:00", party_size: 2 });
    expect(r.error?.message).toBe(LOCKED);
    const fp = await admin.from("room_layout_elements").insert({ room_id: roomId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100 });
    expect(fp.error?.message).toBe(LOCKED);
    const sp = await admin.from("event_showcase_photos").insert({ event_id: eventId, photo_path: `${venueId}/x.jpg` });
    expect(sp.error?.message).toBe(LOCKED);
    const se = await admin.from("event_layout_elements").insert({ event_id: eventId, room_id: roomId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100 });
    expect(se.error?.message).toBe(LOCKED);
  });

  it("gates invitation templates and photo but keeps a basic invitation", async () => {
    const ok = await admin.from("event_invitations").insert({ event_id: eventId, template_id: "romantic-floral", public_slug: `ent${Date.now()}`.slice(0, 20) });
    expect(ok.error).toBeNull();
    const premium = await admin.from("event_invitations").update({ template_id: "classic-minimal" }).eq("event_id", eventId);
    expect(premium.error?.message).toBe(LOCKED);
    const photo = await admin.from("event_invitations").update({ photo_path: `${eventId}-1.jpg` }).eq("event_id", eventId);
    expect(photo.error?.message).toBe(LOCKED);
  });

  it("unlocking per event lets that event through", async () => {
    await admin.from("event_feature_overrides").insert({ event_id: eventId, feature_key: "seating", enabled: true });
    const se = await admin.from("event_layout_elements").insert({ event_id: eventId, room_id: roomId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100 });
    expect(se.error).toBeNull();
  });

  it("never blocks deletes (D7)", async () => {
    await admin.from("event_feature_overrides").delete().eq("event_id", eventId);
    expect((await admin.from("event_layout_elements").delete().eq("event_id", eventId)).error).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run -c vitest.db.config.ts tests/supabase/entitlements_enforcement.test.ts` — Expected: FAIL.

- [ ] **Step 3: Write the migration** — `supabase/migrations/0049_entitlement_enforcement.sql`:
```sql
-- 0049: enforce plan entitlements in the database (admin dashboard spec §4.4).
-- Inserts/updates are checked; deletes never are (D7). Every role, including
-- the service role, is subject to these checks.

create or replace function public.entitlement_locked()
returns void
language plpgsql
as $$
begin
  raise exception 'Оваа функција не е вклучена во вашиот пакет.' using errcode = 'P0001';
end;
$$;
revoke all on function public.entitlement_locked() from public, anon, authenticated;

create or replace function public.enforce_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue uuid;
  v_event uuid;
  v_limit integer;
  v_count integer;
  v_basic text[] := array['romantic-floral', 'elegant-gold'];
begin
  case tg_table_name
  when 'event_guests' then
    select venue_id into v_venue from events where id = new.event_id;
    v_limit := feature_limit(v_venue, new.event_id, 'max_guests');
    if v_limit is not null then
      select count(*) into v_count from event_guests where event_id = new.event_id;
      if v_count >= v_limit then
        raise exception 'Достигнат е лимитот од % гости за овој настан.', v_limit using errcode = 'P0001';
      end if;
    end if;
  when 'rooms' then
    v_limit := feature_limit(new.venue_id, null, 'max_rooms');
    if v_limit is not null then
      select count(*) into v_count from rooms where venue_id = new.venue_id;
      if v_count >= v_limit then
        raise exception 'Достигнат е лимитот од % простории.', v_limit using errcode = 'P0001';
      end if;
    end if;
  when 'events' then
    if new.status not in ('completed', 'cancelled')
       and (tg_op = 'INSERT' or old.status in ('completed', 'cancelled')) then
      v_limit := feature_limit(new.venue_id, null, 'max_active_events');
      if v_limit is not null then
        select count(*) into v_count from events
        where venue_id = new.venue_id and status not in ('completed', 'cancelled') and id <> new.id;
        if v_count >= v_limit then
          raise exception 'Достигнат е лимитот од % активни настани.', v_limit using errcode = 'P0001';
        end if;
      end if;
    end if;
  when 'reservations' then
    if not venue_has_feature(new.venue_id, 'reservations') then perform entitlement_locked(); end if;
  when 'room_fixed_elements', 'room_layout_elements' then
    select venue_id into v_venue from rooms where id = new.room_id;
    if not venue_has_feature(v_venue, 'floor_plan') then perform entitlement_locked(); end if;
  when 'event_showcase_photos' then
    select venue_id into v_venue from events where id = new.event_id;
    if not venue_has_feature(v_venue, 'showcase_photos') then perform entitlement_locked(); end if;
  when 'event_layout_elements' then
    if not event_has_feature(new.event_id, 'seating') then perform entitlement_locked(); end if;
  when 'event_custom_menu_items' then
    if not event_has_feature(new.event_id, 'custom_menu') then perform entitlement_locked(); end if;
  when 'event_invitations' then
    if tg_op = 'INSERT' or new.template_id is distinct from old.template_id or new.message is distinct from old.message then
      if not event_has_feature(new.event_id, 'invitation') then perform entitlement_locked(); end if;
    end if;
    if (tg_op = 'INSERT' or new.template_id is distinct from old.template_id)
       and not (new.template_id = any (v_basic))
       and not event_has_feature(new.event_id, 'invitation_all_templates') then
      perform entitlement_locked();
    end if;
    if new.photo_path is not null and (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path)
       and not event_has_feature(new.event_id, 'invitation_photo') then
      perform entitlement_locked();
    end if;
  end case;
  return new;
end;
$$;
revoke all on function public.enforce_entitlements() from public, anon, authenticated;

create trigger event_guests_entitlements before insert on public.event_guests for each row execute function public.enforce_entitlements();
create trigger rooms_entitlements before insert on public.rooms for each row execute function public.enforce_entitlements();
create trigger events_entitlements before insert or update of status on public.events for each row execute function public.enforce_entitlements();
create trigger reservations_entitlements before insert or update on public.reservations for each row execute function public.enforce_entitlements();
create trigger room_fixed_elements_entitlements before insert or update on public.room_fixed_elements for each row execute function public.enforce_entitlements();
create trigger room_layout_elements_entitlements before insert or update on public.room_layout_elements for each row execute function public.enforce_entitlements();
create trigger event_showcase_photos_entitlements before insert on public.event_showcase_photos for each row execute function public.enforce_entitlements();
create trigger event_layout_elements_entitlements before insert or update on public.event_layout_elements for each row execute function public.enforce_entitlements();
create trigger event_custom_menu_items_entitlements before insert on public.event_custom_menu_items for each row execute function public.enforce_entitlements();
create trigger event_invitations_entitlements before insert or update on public.event_invitations for each row execute function public.enforce_entitlements();
```
The basic templates are the first two of `INVITATION_TEMPLATES` (`romantic-floral`, `elegant-gold`). Add to `tests/lib/pure/features.test.ts`:
```ts
it("the database knows the same basic templates (migration 0049)", () => {
  const sql = readFileSync("supabase/migrations/0049_entitlement_enforcement.sql", "utf8");
  const listed = sql.match(/v_basic text\[\] := array\[([^\]]+)\]/)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
  expect(listed).toEqual([...BASIC_TEMPLATE_IDS]);
});
```
Security note: `effective_features` refuses non-staff, non-service callers; for the browser role the triggers run as definer (`postgres`), where `auth.role()` still reports `authenticated` and `is_venue_staff_for` is true for the staff's own venue, so the check passes for their own rows (other venues' rows are already refused by RLS).

In `lib/api/handler.ts` extend `isUserFacingError`:
```ts
export function isUserFacingError(err: unknown): err is Error {
  if (err instanceof Error && err.constructor === Error && !("code" in err)) return true;
  // Entitlement and limit refusals from our triggers (migration 0049): SQLSTATE
  // P0001 with a message we wrote for users.
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P0001" && typeof (err as { message?: unknown }).message === "string";
}
```
(`errorResponse` uses `err.message` for user-facing errors; TypeScript: cast in `errorResponse` with `(err as { message: string }).message`.)

- [ ] **Step 4: Apply and test**

Run: `psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f <this task's migration> && npx vitest run -c vitest.db.config.ts tests/supabase/entitlements_enforcement.test.ts && npm run test:db && npm run test:unit`
Expected: PASS (existing suites still green: default plan unlocks everything).

- [ ] **Step 5: Commit (user runs)**
```bash
git add supabase/migrations/0049_entitlement_enforcement.sql lib/api/handler.ts tests/supabase/entitlements_enforcement.test.ts tests/lib/pure/features.test.ts
git commit -m "feat(entitlements): enforce plan limits and locked features in the database"
```

### Task 2.4: RSVP and guests under limits

**Files:**
- Modify: `lib/couple/rsvp.ts` (no code change expected — the trigger refuses the insert; confirm the error surfaces)
- Test: `tests/supabase/entitlements_rsvp.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as rsvp } from "@/app/api/invite/[slug]/rsvp/route";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let planId: string;
let venueId: string;
const slug = `lim${Date.now()}`.slice(0, 20);

function post(fullName: string) {
  return rsvp(new NextRequest(`http://localhost/api/invite/${slug}/rsvp`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": `rsvp-${Math.random()}` },
    body: JSON.stringify({ full_name: fullName, attending: true }),
  }), { params: { slug } });
}

beforeAll(async () => {
  planId = (await admin.from("plans").insert({ name: `RSVP limit ${Date.now()}` }).select("id").single()).data!.id;
  await admin.from("plan_features").insert([
    { plan_id: planId, feature_key: "invitation", enabled: true },
    { plan_id: planId, feature_key: "max_guests", enabled: true, limit_value: 1 },
  ]);
  venueId = (await admin.from("venues").insert({ name: "RSVP Limit Venue", plan_id: planId }).select("id").single()).data!.id;
  const eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Lim & It", event_date: "2028-04-01" }).select("id").single()).data!.id;
  await admin.from("event_invitations").insert({ event_id: eventId, template_id: "romantic-floral", public_slug: slug });
  await admin.from("event_guests").insert({ event_id: eventId, full_name: "Ана" });
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("RSVP under the guest limit (Review Focus)", () => {
  it("still updates a listed guest when the list is full", async () => {
    expect((await post("Ана")).status).toBe(200);
  });
  it("refuses a new guest over the limit with the limit message", async () => {
    const res = await post("Нов Гостин");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Достигнат е лимитот од 1 гости за овој настан.");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run -c vitest.db.config.ts tests/supabase/entitlements_rsvp.test.ts` — Expected after Task 2.3: first test PASS; second PASS only if the P0001 message reaches the response. If it answers `"Failed to submit RSVP."`, fix `errorResponse` per Task 2.3 Step 3 and rerun.

- [ ] **Step 3: Commit (user runs)**
```bash
git add tests/supabase/entitlements_rsvp.test.ts lib/api/handler.ts
git commit -m "test(entitlements): public RSVP respects the guest limit"
```

### Task 2.5: Server-side feature reads

**Files:**
- Create: `lib/entitlements/server.ts`
- Test: `tests/supabase/entitlements_server.test.ts`

**Interfaces:**
- Consumes: `effective_features` RPC, `FEATURE_KEYS`, `FeatureMap`.
- Produces:
  - `getEventFeatures(eventId: string): Promise<FeatureMap>` (service role; looks up the venue)
  - `getVenueFeatures(venueId: string): Promise<FeatureMap>` (service role)
  - `eventHasFeature(eventId: string, key: FeatureKey): Promise<boolean>`
  - `toFeatureMap(rows: { feature_key: string; enabled: boolean; limit_value: number | null }[]): FeatureMap` (pure, exported for tests)

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getEventFeatures, getVenueFeatures, eventHasFeature } from "@/lib/entitlements/server";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let planId: string;
let venueId: string;
let eventId: string;

beforeAll(async () => {
  planId = (await admin.from("plans").insert({ name: `Server ${Date.now()}` }).select("id").single()).data!.id;
  await admin.from("plan_features").insert([{ plan_id: planId, feature_key: "budget", enabled: true }]);
  venueId = (await admin.from("venues").insert({ name: "Server Venue", plan_id: planId }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "S & V", event_date: "2028-05-01" }).select("id").single()).data!.id;
});
afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("server feature reads", () => {
  it("returns a complete map", async () => {
    const f = await getEventFeatures(eventId);
    expect(Object.keys(f)).toHaveLength(26);
    expect(f.budget.enabled).toBe(true);
    expect(f.seating.enabled).toBe(false);
    expect((await getVenueFeatures(venueId)).reservations.enabled).toBe(false);
  });
  it("answers single checks", async () => {
    expect(await eventHasFeature(eventId, "budget")).toBe(true);
    expect(await eventHasFeature(eventId, "notes")).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `lib/entitlements/server.ts`:
```ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { FEATURE_KEYS, type FeatureKey, type FeatureMap } from "@/lib/entitlements/features";

type Row = { feature_key: string; enabled: boolean; limit_value: number | null };

export function toFeatureMap(rows: Row[]): FeatureMap {
  const map = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { enabled: false, limit: 0 }])) as FeatureMap;
  for (const r of rows) {
    if ((FEATURE_KEYS as readonly string[]).includes(r.feature_key)) {
      map[r.feature_key as FeatureKey] = { enabled: r.enabled, limit: r.limit_value };
    }
  }
  return map;
}

async function resolve(venueId: string, eventId: string | null): Promise<FeatureMap> {
  const { data, error } = await createServiceRoleClient().rpc("effective_features", { p_venue_id: venueId, p_event_id: eventId });
  if (error) throw error;
  return toFeatureMap(data as Row[]);
}

export async function getVenueFeatures(venueId: string): Promise<FeatureMap> {
  return resolve(venueId, null);
}

export async function getEventFeatures(eventId: string): Promise<FeatureMap> {
  const { data, error } = await createServiceRoleClient().from("events").select("venue_id").eq("id", eventId).single();
  if (error) throw error;
  return resolve(data.venue_id, eventId);
}

export async function eventHasFeature(eventId: string, key: FeatureKey): Promise<boolean> {
  const { data, error } = await createServiceRoleClient().rpc("event_has_feature", { p_event_id: eventId, p_key: key });
  if (error) throw error;
  return data === true;
}
```

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit (user runs)**
```bash
git add lib/entitlements/server.ts tests/supabase/entitlements_server.test.ts
git commit -m "feat(entitlements): server-side feature reads"
```

### Task 2.6: Feature gate in the couple API wrapper

**Files:**
- Modify: `lib/api/handler.ts` (`HandlerOptions`, `withCoupleEvent`)
- Modify (add `feature` option): `app/api/couple/agenda/route.ts`, `agenda/[id]/route.ts` → `"agenda"`; `budget/route.ts`, `budget/[id]/route.ts` → `"budget"`; `checklist/**/route.ts` → `"checklist"`; `locations/**/route.ts` → `"locations"`; `notes/**/route.ts` → `"notes"`; `seating/**/route.ts` → `"seating"`; `invitation/route.ts` → `"invitation"`; `invitation/photo/route.ts`, `invitation/photo/confirm/route.ts` → `"invitation_photo"`; `menu/route.ts` → `"custom_menu"` only when `body.mode === "custom"` (see Step 3). Not gated: `guests/**`, `contact-info`, `guest-count`, `menu/quantities`, `login`, `logout`.
- Test: `tests/lib/api/feature-gate.test.ts`, update `tests/supabase/couple-authz.test.ts` if it asserts on gated routes (it runs on the default plan, so no change expected).

**Interfaces:**
- Consumes: `eventHasFeature` (Task 2.5), `LOCKED_MESSAGE`, `FeatureKey`.
- Produces: `HandlerOptions.feature?: FeatureKey` — when set, mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) of that route answer `403 { error: LOCKED_MESSAGE }` if the event lacks the feature; `GET` is never gated (D7: existing data stays readable). Exception: `DELETE` is also allowed (D7) — so only `POST`, `PUT`, `PATCH` are gated.

- [ ] **Step 1: Write the failing test** — `tests/lib/api/feature-gate.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const has = vi.hoisted(() => ({ eventHasFeature: vi.fn() }));
vi.mock("@/lib/entitlements/server", () => has);

import { withCoupleEvent } from "@/lib/api/handler";

function req(method: string) {
  return new NextRequest("http://localhost/api/couple/budget", { method, headers: { "x-couple-event-id": "e1", "content-type": "application/json" }, body: method === "GET" || method === "DELETE" ? undefined : "{}" });
}

beforeEach(() => has.eventHasFeature.mockReset());

describe("feature gate (spec §4.4)", () => {
  const handler = vi.fn(async () => NextResponse.json({ ok: true }));
  const route = withCoupleEvent(handler, { feature: "budget", fallbackError: "fb" });

  it("refuses POST/PUT/PATCH on a locked feature with 403 and the locked message", async () => {
    has.eventHasFeature.mockResolvedValue(false);
    for (const m of ["POST", "PUT", "PATCH"]) {
      const res = await route(req(m), { params: {} });
      expect(res.status, m).toBe(403);
      expect(await res.json()).toEqual({ error: "Оваа функција не е вклучена во вашиот пакет." });
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets GET and DELETE through on a locked feature (D7)", async () => {
    has.eventHasFeature.mockResolvedValue(false);
    expect((await route(req("GET"), { params: {} })).status).toBe(200);
    expect((await route(req("DELETE"), { params: {} })).status).toBe(200);
    expect(has.eventHasFeature).not.toHaveBeenCalled();
  });

  it("runs the handler when the feature is enabled", async () => {
    has.eventHasFeature.mockResolvedValue(true);
    expect((await route(req("POST"), { params: {} })).status).toBe(200);
    expect(has.eventHasFeature).toHaveBeenCalledWith("e1", "budget");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/lib/api/feature-gate.test.ts` — Expected: FAIL (option ignored → 200).

- [ ] **Step 3: Implement** in `lib/api/handler.ts`:
```ts
import type { FeatureKey } from "@/lib/entitlements/features";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";
// ...in HandlerOptions:
  /**
   * Plan entitlement for this route (admin spec §4.4). POST/PUT/PATCH answer
   * 403 when the event lacks it; GET and DELETE always pass (existing data
   * stays readable and removable).
   */
  feature?: FeatureKey;
```
and in `withCoupleEvent`, after the event id check:
```ts
      if (options.feature && ["POST", "PUT", "PATCH"].includes(request.method)) {
        const { eventHasFeature } = await import("@/lib/entitlements/server");
        if (!(await eventHasFeature(eventId, options.feature))) {
          return NextResponse.json({ error: LOCKED_MESSAGE }, { status: 403 });
        }
      }
```
(Dynamic import keeps `lib/api/handler.ts` importable from unit tests without the service-role client.)

For `app/api/couple/menu/route.ts`: keep the route ungated and add at the top of the handler:
```ts
    if (body.mode === "custom" && !(await eventHasFeature(eventId, "custom_menu"))) {
      return NextResponse.json({ error: LOCKED_MESSAGE }, { status: 403 });
    }
```
with `import { eventHasFeature } from "@/lib/entitlements/server";` and `import { LOCKED_MESSAGE } from "@/lib/entitlements/features";`.

Add `feature: "<key>"` to the options object of every route listed under **Files** (each route already passes an options object to `withCoupleEvent`; add the property next to `fallbackError`).

- [ ] **Step 4: Run** `npx vitest run tests/lib/api && npm run typecheck && npx vitest run -c vitest.db.config.ts tests/supabase/couple-authz.test.ts` — Expected: PASS.

Add to `tests/lib/api/feature-gate.test.ts` a coverage check:
```ts
import { readFileSync } from "fs";
it("every gated couple route declares its feature", () => {
  const expected: Record<string, string> = {
    "app/api/couple/agenda/route.ts": "agenda", "app/api/couple/agenda/[id]/route.ts": "agenda",
    "app/api/couple/budget/route.ts": "budget", "app/api/couple/budget/[id]/route.ts": "budget",
    "app/api/couple/checklist/route.ts": "checklist", "app/api/couple/checklist/[id]/route.ts": "checklist",
    "app/api/couple/checklist/[id]/subtasks/route.ts": "checklist", "app/api/couple/checklist/[id]/subtasks/[subtaskId]/route.ts": "checklist",
    "app/api/couple/locations/route.ts": "locations", "app/api/couple/locations/[id]/route.ts": "locations",
    "app/api/couple/notes/route.ts": "notes", "app/api/couple/notes/[id]/route.ts": "notes",
    "app/api/couple/seating/confirm/route.ts": "seating", "app/api/couple/seating/elements/route.ts": "seating",
    "app/api/couple/seating/elements/[id]/route.ts": "seating", "app/api/couple/seating/revert/route.ts": "seating",
    "app/api/couple/seating/undo/route.ts": "seating", "app/api/couple/invitation/route.ts": "invitation",
    "app/api/couple/invitation/photo/route.ts": "invitation_photo", "app/api/couple/invitation/photo/confirm/route.ts": "invitation_photo",
  };
  for (const [file, key] of Object.entries(expected)) {
    expect(readFileSync(file, "utf8"), file).toContain(`feature: "${key}"`);
  }
});
```

- [ ] **Step 5: Commit (user runs)**
```bash
git add lib/api/handler.ts app/api/couple tests/lib/api/feature-gate.test.ts
git commit -m "feat(entitlements): gate couple API writes by plan feature"
```

### Task 2.7: Blocked venues — couples and venue panel

**Files:**
- Modify: `lib/couple/session-verify.ts` (select venue blocked state)
- Modify: `app/couple/login/page.tsx` → no change; the login route returns the blocked message: `app/api/couple/login/route.ts`
- Create: `components/venue/BlockedScreen.tsx`
- Modify: `app/venue/layout.tsx`
- Test: `tests/supabase/blocked_venue.test.ts`

**Interfaces:**
- Produces: `validateAndRenewCoupleSession(token)` returns `null` for events whose venue has `blocked_at`; `POST /api/couple/login` answers `403 { error: "Пристапот е привремено оневозможен." }` for a blocked venue's credentials; `app/venue/layout.tsx` renders `<BlockedScreen reason={…} />` for staff of a blocked venue.

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createCoupleSession } from "@/lib/couple/session-token";
import { validateAndRenewCoupleSession } from "@/lib/couple/session-verify";
import { POST as login } from "@/app/api/couple/login/route";
import { POST as rsvp } from "@/app/api/invite/[slug]/rsvp/route";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let eventId: string;
let staffId: string;
const slug = `blk${stamp}`.slice(0, 20);

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: "Blocked Venue" }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Blk & Test", event_date: "2028-06-01" }).select("id").single()).data!.id;
  await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: `blk-${stamp}`, p_password: "long-enough-77" });
  await admin.from("event_invitations").insert({ event_id: eventId, template_id: "romantic-floral", public_slug: slug });
  staffId = (await admin.auth.admin.createUser({ email: `blk-${stamp}@test.local`, password: "staff-password-9", email_confirm: true })).data.user!.id;
  await admin.from("venue_staff").insert({ user_id: staffId, venue_id: venueId });
  await admin.from("venues").update({ blocked_at: new Date().toISOString(), blocked_reason: "неплатено" }).eq("id", venueId);
});

afterAll(async () => {
  await admin.auth.admin.deleteUser(staffId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("blocked venue (spec D8)", () => {
  it("staff see no venue data", async () => {
    const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: `blk-${stamp}@test.local`, password: "staff-password-9" });
    expect((await c.from("events").select("id").eq("venue_id", venueId)).data).toEqual([]);
  });

  it("couple sessions are refused and login answers the blocked message", async () => {
    const { token } = await createCoupleSession(eventId);
    expect(await validateAndRenewCoupleSession(token)).toBeNull();
    const res = await login(new NextRequest("http://localhost/api/couple/login", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": `blk-${stamp}` }, body: JSON.stringify({ username: `blk-${stamp}`, password: "long-enough-77" }) }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Пристапот е привремено оневозможен.");
  });

  it("guests can still RSVP", async () => {
    const res = await rsvp(new NextRequest(`http://localhost/api/invite/${slug}/rsvp`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": `blk-g-${stamp}` }, body: JSON.stringify({ full_name: "Гостин", attending: true }) }), { params: { slug } });
    expect(res.status).toBe(200);
  });

  it("staff cannot unblock or change the plan themselves", async () => {
    const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: `blk-${stamp}@test.local`, password: "staff-password-9" });
    await c.from("venues").update({ blocked_at: null }).eq("id", venueId);
    const { data } = await admin.from("venues").select("blocked_at").eq("id", venueId).single();
    expect(data!.blocked_at).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL (session accepted, login 200).

- [ ] **Step 3: Implement**

`lib/couple/session-verify.ts` — change the select and add the check:
```ts
    .select("event_id, expires_at, created_at, events(venues(blocked_at))")
...
  // Admin spec D8: a blocked venue's couples lose access; guests don't.
  const venue = (data as unknown as { events: { venues: { blocked_at: string | null } | null } | null }).events?.venues;
  if (venue?.blocked_at) return null;
```

`app/api/couple/login/route.ts` — after a successful `verifyEventCredentials` and before `createCoupleSession`:
```ts
  const { data: venueState } = await createServiceRoleClient()
    .from("events").select("venues(blocked_at)").eq("id", result.eventId).single();
  if ((venueState as unknown as { venues: { blocked_at: string | null } | null } | null)?.venues?.blocked_at) {
    logSecurityEvent("couple_login_blocked_venue", { event_id: result.eventId });
    return NextResponse.json({ error: "Пристапот е привремено оневозможен." }, { status: 403 });
  }
```
(import `createServiceRoleClient` from `@/lib/supabase/service-role`).

`components/venue/BlockedScreen.tsx`:
```tsx
export function BlockedScreen() {
  return (
    <div className="vp" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="panel" style={{ maxWidth: 520, padding: 32, textAlign: "center" }}>
        <b style={{ fontSize: 18 }}>Пристапот е привремено оневозможен.</b>
        <p className="muted" style={{ marginTop: 8 }}>За повеќе информации контактирајте нè преку страницата за контакт.</p>
      </section>
    </div>
  );
}
```

`app/venue/layout.tsx` — before `getCurrentVenueId`:
```tsx
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { BlockedScreen } from "@/components/venue/BlockedScreen";
...
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: staff } = await createServiceRoleClient().from("venue_staff").select("venues(blocked_at)").eq("user_id", user.id).maybeSingle();
    if ((staff as unknown as { venues: { blocked_at: string | null } | null } | null)?.venues?.blocked_at) return <BlockedScreen />;
  }
```

- [ ] **Step 4: Run** `npx vitest run -c vitest.db.config.ts tests/supabase/blocked_venue.test.ts tests/supabase/couple-session-flow.test.ts tests/lib/couple/session.test.ts && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit (user runs)**
```bash
git add lib/couple/session-verify.ts app/api/couple/login/route.ts components/venue/BlockedScreen.tsx app/venue/layout.tsx tests/supabase/blocked_venue.test.ts
git commit -m "feat(admin): blocked venues lose staff and couple access; invitations keep working"
```

### Task 2.8: Lock UI for couples and venues

**Files:**
- Create: `components/entitlements/LockedBanner.tsx`
- Modify: `components/couple/shell/nav.ts` (add `feature?: FeatureKey` to `CoupleNavItem`; set it: seating rooms → `"seating"`, menu → none, agenda → `"agenda"`, locations → `"locations"`, budget → `"budget"`, checklist → `"checklist"`, notes → `"notes"`, invitation → `"invitation"`)
- Modify: `components/couple/shell/CoupleShell.tsx` (new prop `lockedFeatures: FeatureKey[]`; lock icon on items whose `feature` is locked; banner above `children` when the active item is locked)
- Modify: `app/couple/(protected)/layout.tsx` (load `getEventFeatures(eventId)` and pass locked keys)
- Modify: `components/venue/shell/nav.ts` (`feature?: FeatureKey` on `NavItem`: reservations → `"reservations"`, reports → `"reports"`), `components/venue/shell/PanelShell.tsx` (prop `lockedFeatures`), `app/venue/layout.tsx` (load `getVenueFeatures(venueId)`)
- Test: `tests/components/couple/CoupleShellLocks.test.tsx`

**Interfaces:**
- Consumes: `getEventFeatures`, `getVenueFeatures`, `FeatureKey`, `LOCKED_MESSAGE`.
- Produces: `<LockedBanner />` text „Оваа функција не е вклучена во вашиот пакет. Постоечките податоци можете да ги гледате, но нови не можете да додавате. За надградба контактирајте го вашиот локал.“ (couple) / „…контактирајте нè.“ (venue) via prop `audience: "couple" | "venue"`.

- [ ] **Step 1: Write the failing test**
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/couple/budget", useRouter: () => ({ push: vi.fn() }) }));

import { CoupleShell } from "@/components/couple/shell/CoupleShell";

describe("couple lock UI (spec §4.4)", () => {
  it("marks locked nav items and shows the banner on a locked page", () => {
    render(
      <CoupleShell coupleNames="Ана и Марко" eventDate="2028-06-01" rooms={[]} lockedFeatures={["budget"]}>
        <p>content</p>
      </CoupleShell>,
    );
    expect(screen.getByRole("link", { name: /Буџет/ })).toHaveAttribute("data-locked", "true");
    expect(screen.getByText(/Оваа функција не е вклучена во вашиот пакет/)).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("shows no banner when nothing is locked", () => {
    render(<CoupleShell coupleNames="Ана и Марко" eventDate="2028-06-01" rooms={[]} lockedFeatures={[]}><p>content</p></CoupleShell>);
    expect(screen.queryByText(/не е вклучена/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/components/couple/CoupleShellLocks.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

`components/entitlements/LockedBanner.tsx`:
```tsx
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";

export function LockedBanner({ audience }: { audience: "couple" | "venue" }) {
  return (
    <div role="status" className="panel" style={{ margin: "0 0 16px", padding: "12px 16px", borderLeft: "4px solid var(--gold-lo)" }}>
      <b>{LOCKED_MESSAGE}</b>{" "}
      Постоечките податоци можете да ги гледате, но нови не можете да додавате.{" "}
      {audience === "couple" ? "За надградба контактирајте го вашиот локал." : "За надградба контактирајте нè."}
    </div>
  );
}
```
In `CoupleShell`: add prop `lockedFeatures: FeatureKey[]`; on each nav `Link` add `data-locked={item.feature && lockedFeatures.includes(item.feature) ? "true" : undefined}` and, when locked, append `<Icon name="lock" size="sm" />` after the label (if the sprite has no `lock` icon, render the text `🔒` in a `<span aria-hidden>`); before `{children}` render `{active.feature && lockedFeatures.includes(active.feature) ? <LockedBanner audience="couple" /> : null}`. Do the same in `PanelShell` with `audience="venue"`.

`app/couple/(protected)/layout.tsx`:
```tsx
import { getEventFeatures } from "@/lib/entitlements/server";
import { FEATURE_KEYS } from "@/lib/entitlements/features";
...
  const [summary, features] = await Promise.all([getEventSummary(eventId), getEventFeatures(eventId)]);
  const lockedFeatures = FEATURE_KEYS.filter((k) => !features[k].enabled);
  return (
    <CoupleShell coupleNames={summary.couple_names} eventDate={summary.event_date} rooms={summary.rooms} lockedFeatures={lockedFeatures}>
```
`app/venue/layout.tsx`: after resolving `venueId`, `const features = await getVenueFeatures(venueId); const lockedFeatures = FEATURE_KEYS.filter((k) => !features[k].enabled);` and pass to `PanelShell`.

- [ ] **Step 4: Run** `npm run test:unit && npm run typecheck && npx playwright test` — Expected: PASS (default plan → no locks; CSP clean).

- [ ] **Step 5: Commit (user runs)**
```bash
git add components/entitlements components/couple/shell components/venue/shell app/couple/\(protected\)/layout.tsx app/venue/layout.tsx tests/components/couple/CoupleShellLocks.test.tsx
git commit -m "feat(entitlements): show locked features to couples and venues"
```

### Task 2.9: Seed packages and the packages page (Session 1 brief, E3)

**Files:**
- Create: `supabase/migrations/0051_seed_packages.sql`, `app/couple/(protected)/packages/page.tsx`, `lib/entitlements/packages.ts`
- Modify: `components/entitlements/LockedBanner.tsx` (couple variant links to `/couple/packages`)
- Test: `tests/supabase/seed_packages.test.ts`, `tests/components/couple/PackagesPage.test.tsx`

**Interfaces:**
- Consumes: `plans`, `plan_features` (Task 2.2), `FEATURES` (Task 2.1).
- Produces: `listPackagesForDisplay(): Promise<{ id: string; name: string; description: string | null; features: Record<FeatureKey, ResolvedFeature> }[]>` (service role, ordered by `sort_order`, all plans except none); page `/couple/packages` (read-only, no payment).

Packages (from `productioncheck/img/0-02-05-ee847208…jpg`), inserted only if a plan with that name does not exist; the default plan "Стандарден" stays default and keeps every existing venue:

| name | sort | description | differences from "everything on, unlimited" |
|---|---|---|---|
| START | 10 | Бесплатно, го обезбедува ресторанот. Фото и видео се чуваат 15 дена. | `video_greetings` off, `storage_gb` 5, `photo_retention_days` 15, `invitation_all_templates` off, `reports` off |
| PREMIUM | 20 | 20 GB · 2.000 ден. · чување 30 дена · преземање во оригинален квалитет | `storage_gb` 20, `photo_retention_days` 30, `reports` off |
| PREMIUM+ | 30 | 50 GB · 4.000 ден. · чување 40 дена · статистика · приоритетна поддршка | `storage_gb` 50, `photo_retention_days` 40 |
| ULTRA | 40 | 100 GB · 6.000 ден. · чување 60 дена · напредна статистика · тематски албуми | `storage_gb` 100, `photo_retention_days` 60 |

- [ ] **Step 1: Write the failing tests**

`tests/supabase/seed_packages.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function features(name: string) {
  const { data: plan } = await admin.from("plans").select("id, is_default").eq("name", name).single();
  const { data } = await admin.from("plan_features").select("feature_key, enabled, limit_value").eq("plan_id", plan!.id);
  return { isDefault: plan!.is_default, f: Object.fromEntries(data!.map((r) => [r.feature_key, r])) };
}

describe("seeded packages (0051)", () => {
  it("creates START..ULTRA with every catalogue key", async () => {
    for (const name of ["START", "PREMIUM", "PREMIUM+", "ULTRA"]) {
      const { isDefault, f } = await features(name);
      expect(isDefault, name).toBe(false);
      expect(Object.keys(f), name).toHaveLength(26);
    }
  });
  it("sets storage and retention per package", async () => {
    const expected: Record<string, [number, number]> = { START: [5, 15], PREMIUM: [20, 30], "PREMIUM+": [50, 40], ULTRA: [100, 60] };
    for (const [name, [gb, days]] of Object.entries(expected)) {
      const { f } = await features(name);
      expect(f.storage_gb.limit_value, name).toBe(gb);
      expect(f.photo_retention_days.limit_value, name).toBe(days);
    }
    expect((await features("START")).f.video_greetings.enabled).toBe(false);
    expect((await features("PREMIUM")).f.video_greetings.enabled).toBe(true);
  });
  it("keeps Стандарден as the default plan", async () => {
    expect((await features("Стандарден")).isDefault).toBe(true);
  });
});
```

`tests/components/couple/PackagesPage.test.tsx`: mock `@/lib/entitlements/packages` to return two packages, render `await PackagesPage()`, assert both names, the description text and a „Заклучено“/„Вклучено“ mark per feature row; assert no payment button (`queryByRole("button", { name: /плати|купи/i })` is null) and the text „За активирање контактирајте го вашиот ресторан.“

- [ ] **Step 2: Run to verify they fail** — `npx vitest run -c vitest.db.config.ts tests/supabase/seed_packages.test.ts` → FAIL (no plans).

- [ ] **Step 3: Implement**

`supabase/migrations/0051_seed_packages.sql`:
```sql
-- 0051: the packages from the owner's pricing slide (admin brief E3).
-- Stored as ordinary plans; the admin can edit them. Prices live in the
-- description until payments exist (DECISIONS.md).
insert into public.plans (name, description, sort_order)
select v.name, v.description, v.sort_order
from (values
  ('START', 'Бесплатно, го обезбедува ресторанот. Фото и видео се чуваат 15 дена.', 10),
  ('PREMIUM', '20 GB · 2.000 ден. · чување 30 дена · преземање во оригинален квалитет', 20),
  ('PREMIUM+', '50 GB · 4.000 ден. · чување 40 дена · статистика · приоритетна поддршка', 30),
  ('ULTRA', '100 GB · 6.000 ден. · чување 60 дена · напредна статистика · тематски албуми', 40)
) as v(name, description, sort_order)
where not exists (select 1 from public.plans p where p.name = v.name);

insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
select p.id, k,
  case
    when p.name = 'START' and k in ('video_greetings', 'invitation_all_templates', 'reports') then false
    when p.name = 'PREMIUM' and k = 'reports' then false
    else true
  end,
  case k
    when 'storage_gb' then case p.name when 'START' then 5 when 'PREMIUM' then 20 when 'PREMIUM+' then 50 else 100 end
    when 'photo_retention_days' then case p.name when 'START' then 15 when 'PREMIUM' then 30 when 'PREMIUM+' then 40 else 60 end
    else null
  end
from public.plans p,
     unnest(array['invitation','invitation_all_templates','invitation_photo','seating','custom_menu',
                  'budget','checklist','agenda','locations','notes','max_guests',
                  'reservations','floor_plan','showcase_photos','max_rooms','max_active_events','reports',
                  'photo_album','guest_greetings','video_greetings','reminders','personal_invite_links','print_qr',
                  'storage_gb','photo_retention_days','co_organizers']) as k
where p.name in ('START', 'PREMIUM', 'PREMIUM+', 'ULTRA')
on conflict (plan_id, feature_key) do nothing;
```

`lib/entitlements/packages.ts` (server-only, service role): select plans with `plan_features`, map to `toFeatureMap`-style records (missing key → locked), order by `sort_order`, exclude plans whose name starts with `_` (reserved for internal/test plans).

`app/couple/(protected)/packages/page.tsx`: server component; heading „Пакети“, one column per package (stack on mobile) with name, description, and the `FEATURES` rows grouped scope `event` only: switch → „Вклучено“/„Заклучено“, limit → value or „Неограничено“. Footer text „За активирање контактирајте го вашиот ресторан.“ No payment controls.

`LockedBanner` couple variant: append `<a href="/couple/packages">Види пакети</a>`.

- [ ] **Step 4: Run** — `psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f <this task's migration> && npx vitest run -c vitest.db.config.ts tests/supabase/seed_packages.test.ts && npx vitest run tests/components/couple/PackagesPage.test.tsx && npm run typecheck` → PASS. Also rerun `tests/supabase/entitlements_*.test.ts` (their fixtures create their own plans, unaffected).

- [ ] **Step 5: Commit (user runs)**
```bash
git add supabase/migrations/0051_seed_packages.sql lib/entitlements/packages.ts app/couple/\(protected\)/packages components/entitlements/LockedBanner.tsx tests/supabase/seed_packages.test.ts tests/components/couple/PackagesPage.test.tsx
git commit -m "feat(entitlements): seed START..ULTRA packages and a read-only packages page"
```

### Task 2.10: Phase 2 gate

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm run test:unit && npm run test:db && npx playwright test` — Expected: all PASS.
- [ ] **Step 2: Commit (user runs)** — confirm nothing from Phase 2 is left unstaged.

---

## Phase 3 — Admin screens

### Task 3.1: Admin read models

**Files:**
- Create: `lib/admin/queries.ts`
- Test: `tests/supabase/admin_queries.test.ts`

**Interfaces:**
- Produces:
```ts
export type OverviewStats = { venues: number; activeVenues: number; blockedVenues: number; signupsByWeek: { week: string; count: number }[]; upcomingEvents: number; newMessages: number };
export type VenueRow = { id: string; name: string; planId: string; planName: string; createdAt: string; staffCount: number; eventCount: number; lastSignInAt: string | null; blockedAt: string | null };
export type VenueDetail = VenueRow & { blockedReason: string | null; staff: { userId: string; email: string; mfa: boolean; lastSignInAt: string | null }[]; rooms: { id: string; name: string }[]; events: { id: string; date: string; coupleNames: string; status: string; type: string | null }[] };
export type EventRow = { id: string; venueId: string; venueName: string; date: string; startTime: string | null; endTime: string | null; coupleNames: string; status: string; type: string | null; guestEstimate: number | null };
export type PlanRow = { id: string; name: string; description: string | null; sortOrder: number; isDefault: boolean; venueCount: number; features: Record<string, { enabled: boolean; limit: number | null }> };
export type OverrideRow = { featureKey: string; enabled: boolean | null; limitOverride: boolean; limitValue: number | null; note: string | null };
export async function getOverviewStats(): Promise<OverviewStats>;
export async function listVenues(filter: { q?: string; planId?: string }): Promise<VenueRow[]>;
export async function getVenueDetail(id: string): Promise<VenueDetail | null>;
export async function listEvents(filter: { venueId?: string; from?: string; to?: string; status?: string }): Promise<EventRow[]>;
export async function getEventDetail(id: string): Promise<EventRow | null>;
export async function listPlans(): Promise<PlanRow[]>;
export async function getVenueOverrides(venueId: string): Promise<OverrideRow[]>;
export async function getEventOverrides(eventId: string): Promise<OverrideRow[]>;
export async function listAudit(filter: { venueId?: string; eventId?: string; action?: string; actorType?: string; from?: string; to?: string; page?: number }): Promise<{ rows: AuditRow[]; hasMore: boolean }>;
export type AuditRow = { id: number; occurredAt: string; actorType: string; actorId: string | null; action: string; venueId: string | null; eventId: string | null; targetId: string | null; requestId: string | null; details: Record<string, unknown> };
```
All via `createServiceRoleClient()`; staff emails/MFA/last sign-in via `auth.admin.listUsers` (paged) filtered by the venue's staff ids, factors via `auth.admin.mfa.listFactors({ userId })`. Only columns allowed by the Global Constraints.

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getOverviewStats, listVenues, getVenueDetail, listEvents, listPlans } from "@/lib/admin/queries";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let staffId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Query Venue ${stamp}` }).select("id").single()).data!.id;
  staffId = (await admin.auth.admin.createUser({ email: `q-${stamp}@test.local`, password: "query-password-1", email_confirm: true })).data.user!.id;
  await admin.from("venue_staff").insert({ user_id: staffId, venue_id: venueId });
  await admin.from("events").insert({ venue_id: venueId, couple_names: "Q & A", event_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), contact_email: "secret@example.com" });
  await admin.from("reservations").insert({ venue_id: venueId, room_id: (await admin.from("rooms").insert({ venue_id: venueId, name: "R" }).select("id").single()).data!.id, guest_name: "Тајно Име", phone: "070111", date: "2028-07-01", start_time: "12:00", party_size: 2 });
});
afterAll(async () => {
  await admin.auth.admin.deleteUser(staffId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("admin read models", () => {
  it("lists and finds venues with counts", async () => {
    const rows = await listVenues({ q: `Query Venue ${stamp}` });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ staffCount: 1, eventCount: 1, planName: "Стандарден", blockedAt: null });
  });

  it("returns venue detail with staff but no private data", async () => {
    const d = await getVenueDetail(venueId);
    expect(d!.staff[0]).toMatchObject({ email: `q-${stamp}@test.local`, mfa: false });
    const raw = JSON.stringify(d);
    expect(raw).not.toContain("secret@example.com");
    expect(raw).not.toContain("Тајно Име");
    expect(raw).not.toContain("070111");
  });

  it("lists events across venues without contact details", async () => {
    const rows = await listEvents({ venueId });
    expect(rows[0]).toMatchObject({ coupleNames: "Q & A", venueName: `Query Venue ${stamp}` });
    expect(JSON.stringify(rows)).not.toContain("secret@example.com");
  });

  it("counts overview numbers and plans", async () => {
    const s = await getOverviewStats();
    expect(s.venues).toBeGreaterThan(0);
    expect(s.upcomingEvents).toBeGreaterThan(0);
    expect(s.signupsByWeek).toHaveLength(8);
    const plans = await listPlans();
    expect(plans.find((p) => p.isDefault)!.venueCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `lib/admin/queries.ts`:
```ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type OverviewStats = { venues: number; activeVenues: number; blockedVenues: number; signupsByWeek: { week: string; count: number }[]; upcomingEvents: number; newMessages: number };
export type VenueRow = { id: string; name: string; planId: string; planName: string; createdAt: string; staffCount: number; eventCount: number; lastSignInAt: string | null; blockedAt: string | null };
export type VenueDetail = VenueRow & { blockedReason: string | null; staff: { userId: string; email: string; mfa: boolean; lastSignInAt: string | null }[]; rooms: { id: string; name: string }[]; events: { id: string; date: string; coupleNames: string; status: string; type: string | null }[] };
export type EventRow = { id: string; venueId: string; venueName: string; date: string; startTime: string | null; endTime: string | null; coupleNames: string; status: string; type: string | null; guestEstimate: number | null };
export type PlanRow = { id: string; name: string; description: string | null; sortOrder: number; isDefault: boolean; venueCount: number; features: Record<string, { enabled: boolean; limit: number | null }> };
export type OverrideRow = { featureKey: string; enabled: boolean | null; limitOverride: boolean; limitValue: number | null; note: string | null };
export type AuditRow = { id: number; occurredAt: string; actorType: string; actorId: string | null; action: string; venueId: string | null; eventId: string | null; targetId: string | null; requestId: string | null; details: Record<string, unknown> };

const db = () => createServiceRoleClient();
const DAY = 86_400_000;

type AuthUser = { id: string; email?: string; last_sign_in_at?: string | null };

async function authUsersById(ids: string[]): Promise<Map<string, AuthUser>> {
  const wanted = new Set(ids);
  const found = new Map<string, AuthUser>();
  for (let page = 1; wanted.size > found.size; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (wanted.has(u.id)) found.set(u.id, u);
    if (data.users.length < 1000) break;
  }
  return found;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const client = db();
  const [{ data: venues }, { data: staff }, { count: upcoming }, { count: newMessages }] = await Promise.all([
    client.from("venues").select("id, created_at, blocked_at").limit(10000),
    client.from("venue_staff").select("user_id, venue_id").limit(10000),
    client.from("events").select("id", { count: "exact", head: true })
      .gte("event_date", new Date().toISOString().slice(0, 10))
      .lte("event_date", new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10)),
    client.from("contact_submissions").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const users = await authUsersById((staff ?? []).map((s) => s.user_id));
  const cutoff = Date.now() - 30 * DAY;
  const activeVenueIds = new Set((staff ?? []).filter((s) => {
    const at = users.get(s.user_id)?.last_sign_in_at;
    return at ? new Date(at).getTime() >= cutoff : false;
  }).map((s) => s.venue_id));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(Date.now() - (7 - i) * 7 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    return {
      week: start.toISOString().slice(0, 10),
      count: (venues ?? []).filter((v) => new Date(v.created_at) >= start && new Date(v.created_at) < end).length,
    };
  });
  return {
    venues: venues?.length ?? 0,
    activeVenues: activeVenueIds.size,
    blockedVenues: (venues ?? []).filter((v) => v.blocked_at).length,
    signupsByWeek: weeks,
    upcomingEvents: upcoming ?? 0,
    newMessages: newMessages ?? 0,
  };
}

export async function listVenues(filter: { q?: string; planId?: string }): Promise<VenueRow[]> {
  let query = db().from("venues")
    .select("id, name, plan_id, created_at, blocked_at, plans(name), venue_staff(user_id), events(id)")
    .order("created_at", { ascending: false }).limit(1000);
  if (filter.q) query = query.ilike("name", `%${filter.q.replace(/[%_]/g, "")}%`);
  if (filter.planId) query = query.eq("plan_id", filter.planId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data as unknown as { id: string; name: string; plan_id: string; created_at: string; blocked_at: string | null; plans: { name: string }; venue_staff: { user_id: string }[]; events: { id: string }[] }[];
  const users = await authUsersById(rows.flatMap((r) => r.venue_staff.map((s) => s.user_id)));
  return rows.map((r) => ({
    id: r.id, name: r.name, planId: r.plan_id, planName: r.plans.name, createdAt: r.created_at,
    staffCount: r.venue_staff.length, eventCount: r.events.length, blockedAt: r.blocked_at,
    lastSignInAt: r.venue_staff.map((s) => users.get(s.user_id)?.last_sign_in_at ?? null).filter(Boolean).sort().at(-1) ?? null,
  }));
}

export async function getVenueDetail(id: string): Promise<VenueDetail | null> {
  const { data, error } = await db().from("venues")
    .select("id, name, plan_id, created_at, blocked_at, blocked_reason, plans(name), venue_staff(user_id), rooms(id, name), events(id, event_date, couple_names, status, event_type)")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const v = data as unknown as { id: string; name: string; plan_id: string; created_at: string; blocked_at: string | null; blocked_reason: string | null; plans: { name: string }; venue_staff: { user_id: string }[]; rooms: { id: string; name: string }[]; events: { id: string; event_date: string; couple_names: string; status: string; event_type: string | null }[] };
  const users = await authUsersById(v.venue_staff.map((s) => s.user_id));
  const staff = await Promise.all(v.venue_staff.map(async (s) => {
    const { data: factors } = await db().auth.admin.mfa.listFactors({ userId: s.user_id });
    return { userId: s.user_id, email: users.get(s.user_id)?.email ?? "", mfa: (factors?.factors ?? []).some((f) => f.status === "verified"), lastSignInAt: users.get(s.user_id)?.last_sign_in_at ?? null };
  }));
  return {
    id: v.id, name: v.name, planId: v.plan_id, planName: v.plans.name, createdAt: v.created_at,
    staffCount: staff.length, eventCount: v.events.length, blockedAt: v.blocked_at, blockedReason: v.blocked_reason,
    lastSignInAt: staff.map((s) => s.lastSignInAt).filter(Boolean).sort().at(-1) ?? null,
    staff, rooms: v.rooms,
    events: v.events.map((e) => ({ id: e.id, date: e.event_date, coupleNames: e.couple_names, status: e.status, type: e.event_type })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

const EVENT_COLUMNS = "id, venue_id, event_date, start_time, end_time, couple_names, status, event_type, guest_count_estimate, venues(name)";
type EventDb = { id: string; venue_id: string; event_date: string; start_time: string | null; end_time: string | null; couple_names: string; status: string; event_type: string | null; guest_count_estimate: number | null; venues: { name: string } };
const toEvent = (e: EventDb): EventRow => ({ id: e.id, venueId: e.venue_id, venueName: e.venues.name, date: e.event_date, startTime: e.start_time, endTime: e.end_time, coupleNames: e.couple_names, status: e.status, type: e.event_type, guestEstimate: e.guest_count_estimate });

export async function listEvents(filter: { venueId?: string; from?: string; to?: string; status?: string }): Promise<EventRow[]> {
  let query = db().from("events").select(EVENT_COLUMNS).order("event_date").limit(1000);
  if (filter.venueId) query = query.eq("venue_id", filter.venueId);
  if (filter.from) query = query.gte("event_date", filter.from);
  if (filter.to) query = query.lte("event_date", filter.to);
  if (filter.status) query = query.eq("status", filter.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as EventDb[]).map(toEvent);
}

export async function getEventDetail(id: string): Promise<EventRow | null> {
  const { data, error } = await db().from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toEvent(data as unknown as EventDb) : null;
}

export async function listPlans(): Promise<PlanRow[]> {
  const { data, error } = await db().from("plans")
    .select("id, name, description, sort_order, is_default, plan_features(feature_key, enabled, limit_value), venues(id)")
    .order("sort_order").order("name");
  if (error) throw error;
  return (data as unknown as { id: string; name: string; description: string | null; sort_order: number; is_default: boolean; plan_features: { feature_key: string; enabled: boolean; limit_value: number | null }[]; venues: { id: string }[] }[])
    .map((p) => ({
      id: p.id, name: p.name, description: p.description, sortOrder: p.sort_order, isDefault: p.is_default, venueCount: p.venues.length,
      features: Object.fromEntries(p.plan_features.map((f) => [f.feature_key, { enabled: f.enabled, limit: f.limit_value }])),
    }));
}

type OverrideDb = { feature_key: string; enabled: boolean | null; limit_override: boolean; limit_value: number | null; note: string | null };
const toOverride = (o: OverrideDb): OverrideRow => ({ featureKey: o.feature_key, enabled: o.enabled, limitOverride: o.limit_override, limitValue: o.limit_value, note: o.note });

export async function getVenueOverrides(venueId: string): Promise<OverrideRow[]> {
  const { data, error } = await db().from("venue_feature_overrides").select("feature_key, enabled, limit_override, limit_value, note").eq("venue_id", venueId);
  if (error) throw error;
  return (data as OverrideDb[]).map(toOverride);
}

export async function getEventOverrides(eventId: string): Promise<OverrideRow[]> {
  const { data, error } = await db().from("event_feature_overrides").select("feature_key, enabled, limit_override, limit_value, note").eq("event_id", eventId);
  if (error) throw error;
  return (data as OverrideDb[]).map(toOverride);
}

const AUDIT_PAGE = 50;

export async function listAudit(filter: { venueId?: string; eventId?: string; action?: string; actorType?: string; from?: string; to?: string; page?: number }): Promise<{ rows: AuditRow[]; hasMore: boolean }> {
  const page = Math.max(0, filter.page ?? 0);
  let query = db().from("audit_log").select("*").order("occurred_at", { ascending: false }).range(page * AUDIT_PAGE, page * AUDIT_PAGE + AUDIT_PAGE);
  if (filter.venueId) query = query.eq("venue_id", filter.venueId);
  if (filter.eventId) query = query.eq("event_id", filter.eventId);
  if (filter.action) query = query.eq("action", filter.action);
  if (filter.actorType) query = query.eq("actor_type", filter.actorType);
  if (filter.from) query = query.gte("occurred_at", filter.from);
  if (filter.to) query = query.lte("occurred_at", filter.to);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({ id: r.id, occurredAt: r.occurred_at, actorType: r.actor_type, actorId: r.actor_id, action: r.action, venueId: r.venue_id, eventId: r.event_id, targetId: r.target_id, requestId: r.request_id, details: r.details }));
  return { rows: rows.slice(0, AUDIT_PAGE), hasMore: rows.length > AUDIT_PAGE };
}
```
Note: `getOverviewStats` reads `contact_submissions.status`, added in Task 4.1. Until then, in this task use `.select("id", { count: "exact", head: true })` without the `status` filter and add the filter in Task 4.1 Step 3.

- [ ] **Step 4: Run** `npx vitest run -c vitest.db.config.ts tests/supabase/admin_queries.test.ts && npx vitest run tests/security/admin-static.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit (user runs)**
```bash
git add lib/admin/queries.ts tests/supabase/admin_queries.test.ts
git commit -m "feat(admin): read models for overview, venues, events, plans, audit"
```

### Task 3.2: Overview, venues list and venue detail (read-only)

**Files:**
- Modify: `app/admin/(panel)/page.tsx`
- Create: `app/admin/(panel)/venues/page.tsx`, `app/admin/(panel)/venues/[id]/page.tsx`
- Test: `tests/components/admin/pages.test.tsx` (render server components with mocked queries)

- [ ] **Step 1: Write the failing test**
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn(async () => ({ adminUserId: "a", requestId: null })) }));
vi.mock("@/lib/admin/queries", () => ({
  getOverviewStats: vi.fn(async () => ({ venues: 12, activeVenues: 7, blockedVenues: 1, signupsByWeek: Array.from({ length: 8 }, (_, i) => ({ week: `2028-01-0${i + 1}`, count: i })), upcomingEvents: 5, newMessages: 3 })),
  listAudit: vi.fn(async () => ({ rows: [], hasMore: false })),
  listVenues: vi.fn(async () => [{ id: "v1", name: "Сала Езеро", planId: "p", planName: "Стандарден", createdAt: "2028-01-01T00:00:00Z", staffCount: 2, eventCount: 9, lastSignInAt: null, blockedAt: null }]),
  listPlans: vi.fn(async () => []),
}));

import OverviewPage from "@/app/admin/(panel)/page";
import VenuesPage from "@/app/admin/(panel)/venues/page";

describe("admin pages", () => {
  it("overview shows the counts", async () => {
    render(await OverviewPage());
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Активни (30 дена)")).toBeInTheDocument();
  });
  it("venues list links to detail", async () => {
    render(await VenuesPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Сала Езеро" })).toHaveAttribute("href", "/admin/venues/v1");
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/(panel)/page.tsx`:
```tsx
import { getOverviewStats, listAudit } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [stats, audit] = await Promise.all([getOverviewStats(), listAudit({ actorType: "admin" })]);
  const tiles = [
    { label: "Сали", value: stats.venues },
    { label: "Активни (30 дена)", value: stats.activeVenues },
    { label: "Блокирани", value: stats.blockedVenues },
    { label: "Настани (30 дена)", value: stats.upcomingEvents },
    { label: "Нови пораки", value: stats.newMessages },
  ];
  return (
    <div className="wrap">
      <div className="tiles">
        {tiles.map((t) => (
          <div key={t.label} className="tile"><span className="meta-lab">{t.label}</span><b>{t.value}</b></div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-h"><h2 className="panel-t">Регистрации по недела</h2></div>
        <table className="tbl"><tbody>
          {stats.signupsByWeek.map((w) => <tr key={w.week}><td>{w.week}</td><td>{w.count}</td></tr>)}
        </tbody></table>
      </section>
      <section className="panel">
        <div className="panel-h"><h2 className="panel-t">Последни админ акции</h2></div>
        <table className="tbl"><tbody>
          {audit.rows.slice(0, 20).map((r) => <tr key={r.id}><td>{new Date(r.occurredAt).toLocaleString("mk-MK", { timeZone: "Europe/Skopje" })}</td><td>{r.action}</td></tr>)}
        </tbody></table>
      </section>
    </div>
  );
}
```

`app/admin/(panel)/venues/page.tsx`:
```tsx
import Link from "next/link";
import { listPlans, listVenues } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function VenuesPage({ searchParams }: { searchParams: Promise<{ q?: string; plan?: string }> }) {
  const { q, plan } = await searchParams;
  const [venues, plans] = await Promise.all([listVenues({ q, planId: plan }), listPlans()]);
  return (
    <div className="wrap">
      <form className="panel" style={{ padding: 16, display: "flex", gap: 8 }}>
        <input className="fld" name="q" defaultValue={q} placeholder="Пребарај сала" aria-label="Пребарај сала" />
        <select className="fld" name="plan" defaultValue={plan ?? ""} aria-label="Ниво">
          <option value="">Сите нивоа</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn btn-gold" type="submit">Филтрирај</button>
      </form>
      <section className="panel">
        <table className="tbl">
          <thead><tr><th>Сала</th><th>Ниво</th><th>Регистрирана</th><th>Вработени</th><th>Настани</th><th>Последна најава</th><th>Статус</th></tr></thead>
          <tbody>
            {venues.map((v) => (
              <tr key={v.id}>
                <td><Link href={`/admin/venues/${v.id}`}>{v.name}</Link></td>
                <td>{v.planName}</td>
                <td>{v.createdAt.slice(0, 10)}</td>
                <td>{v.staffCount}</td>
                <td>{v.eventCount}</td>
                <td>{v.lastSignInAt?.slice(0, 10) ?? "—"}</td>
                <td>{v.blockedAt ? "Блокирана" : "Активна"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
```

`app/admin/(panel)/venues/[id]/page.tsx` renders `getVenueDetail(id)` (not found → `notFound()`), the plan select, overrides editor, staff table with action buttons, rooms, events, block and delete sections — the interactive parts are the client components from Task 3.3; in this task render the read-only sections:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVenueDetail, getVenueOverrides, listPlans } from "@/lib/admin/queries";
import { getVenueFeatures } from "@/lib/entitlements/server";
import { VenueAdminPanels } from "@/components/admin/VenueAdminPanels";

export const dynamic = "force-dynamic";

export default async function VenueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const venue = await getVenueDetail(id);
  if (!venue) notFound();
  const [plans, overrides, features] = await Promise.all([listPlans(), getVenueOverrides(id), getVenueFeatures(id)]);
  return (
    <div className="wrap">
      <VenueAdminPanels venue={venue} plans={plans.map((p) => ({ id: p.id, name: p.name }))} overrides={overrides} features={features} />
      <section className="panel">
        <div className="panel-h"><h2 className="panel-t">Настани</h2></div>
        <table className="tbl"><tbody>
          {venue.events.map((e) => (
            <tr key={e.id}><td>{e.date}</td><td><Link href={`/admin/events/${e.id}`}>{e.coupleNames}</Link></td><td>{e.status}</td></tr>
          ))}
        </tbody></table>
      </section>
      <section className="panel">
        <div className="panel-h"><h2 className="panel-t">Простории</h2></div>
        <ul style={{ padding: "12px 20px" }}>{venue.rooms.map((r) => <li key={r.id}>{r.name}</li>)}</ul>
      </section>
    </div>
  );
}
```
`VenueAdminPanels` is created in Task 3.3; for this task create it as a stub that renders the venue name and plan name only:
```tsx
"use client";
import type { VenueDetail, OverrideRow } from "@/lib/admin/queries";
import type { FeatureMap } from "@/lib/entitlements/features";
export function VenueAdminPanels({ venue }: { venue: VenueDetail; plans: { id: string; name: string }[]; overrides: OverrideRow[]; features: FeatureMap }) {
  return <section className="panel"><div className="panel-h"><h2 className="panel-t">{venue.name}</h2></div><p style={{ padding: "0 20px 16px" }}>{venue.planName}</p></section>;
}
```
(`lib/admin/queries` types imported into a client component are `import type` only — no server code reaches the bundle.)

- [ ] **Step 4: Run** `npx vitest run tests/components/admin && npm run typecheck && npm run build` — Expected: PASS.

- [ ] **Step 5: Commit (user runs)**
```bash
git add app/admin components/admin/VenueAdminPanels.tsx tests/components/admin/pages.test.tsx
git commit -m "feat(admin): overview and venues pages"
```

### Task 3.3: Venue actions — plan, overrides, staff, block, delete

**Files:**
- Create: `lib/admin/venue-actions-core.ts`, `app/admin/(panel)/venues/actions.ts`, `components/admin/FeatureOverridesEditor.tsx`, `components/admin/ConfirmTyped.tsx`, `components/admin/ActionButton.tsx`
- Modify: `components/admin/VenueAdminPanels.tsx` (full version)
- Test: `tests/supabase/admin_venue_actions.test.ts`, `tests/components/admin/FeatureOverridesEditor.test.tsx`, `tests/components/admin/ConfirmTyped.test.tsx`

**Interfaces:**
- Consumes: `adminAction`, `ActionResult`, `deleteVenueAccount` (`lib/privacy/erase.ts`), `FEATURES`, `FeatureMap`, `OverrideRow`.
- Produces (Server Actions, all via `adminAction`):
  - `renameVenue({ venueId, name })`
  - `setVenuePlan({ venueId, planId })`
  - `saveVenueOverride({ venueId, featureKey, enabled: boolean | null, limitOverride: boolean, limitValue: number | null, note: string | null })` (removes the row when `enabled === null && !limitOverride`)
  - `sendStaffPasswordReset({ venueId, userId })`
  - `removeStaffMfa({ venueId, userId })`
  - `signOutStaff({ venueId, userId })`
  - `blockVenue({ venueId, reason })`, `unblockVenue({ venueId })`
  - `deleteVenue({ venueId, confirmName })`
- `lib/admin/venue-actions-core.ts` exports `venueSchemas` and `venueActionCore` — `{ rename, setPlan, saveOverride, block, unblock, remove, staffPasswordReset, staffRemoveMfa, staffSignOut }`, each `(input, ctx) => Promise<{ data, audit? }>` (tested directly, no Next request context). `actions.ts` ("use server", async exports only) wraps each with `adminAction`.

- [ ] **Step 1: Write the failing tests**

`tests/supabase/admin_venue_actions.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { venueActionCore } from "@/lib/admin/venue-actions-core";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad01", requestId: "req-admin" };
let venueId: string;
let planId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: "Action Venue" }).select("id").single()).data!.id;
  planId = (await admin.from("plans").insert({ name: `Action plan ${Date.now()}` }).select("id").single()).data!.id;
});
afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("admin venue actions", () => {
  it("renames, changes plan and audits each change", async () => {
    const r1 = await venueActionCore.rename({ venueId, name: "Нова Сала" }, ctx);
    expect(r1.audit).toMatchObject({ action: "admin_venue_renamed", venueId });
    await venueActionCore.setPlan({ venueId, planId }, ctx);
    const { data } = await admin.from("venues").select("name, plan_id").eq("id", venueId).single();
    expect(data).toEqual({ name: "Нова Сала", plan_id: planId });
  });

  it("saves and clears an override", async () => {
    await venueActionCore.saveOverride({ venueId, featureKey: "reservations", enabled: true, limitOverride: false, limitValue: null, note: "договор" }, ctx);
    expect((await admin.from("venue_feature_overrides").select("enabled, note, updated_by").eq("venue_id", venueId).single()).data).toEqual({ enabled: true, note: "договор", updated_by: ctx.adminUserId });
    await venueActionCore.saveOverride({ venueId, featureKey: "reservations", enabled: null, limitOverride: false, limitValue: null, note: null }, ctx);
    expect((await admin.from("venue_feature_overrides").select("*").eq("venue_id", venueId)).data).toEqual([]);
  });

  it("blocks with a reason and unblocks", async () => {
    await venueActionCore.block({ venueId, reason: "неплатено" }, ctx);
    expect((await admin.from("venues").select("blocked_reason").eq("id", venueId).single()).data!.blocked_reason).toBe("неплатено");
    await venueActionCore.unblock({ venueId }, ctx);
    expect((await admin.from("venues").select("blocked_at").eq("id", venueId).single()).data!.blocked_at).toBeNull();
  });

  it("refuses deletion unless the typed name matches", async () => {
    await expect(venueActionCore.remove({ venueId, confirmName: "погрешно" }, ctx)).rejects.toThrow("Внесете го точното име на салата.");
  });
});
```

`tests/components/admin/ConfirmTyped.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmTyped } from "@/components/admin/ConfirmTyped";

describe("ConfirmTyped", () => {
  it("enables the action only when the text matches exactly", () => {
    const onConfirm = vi.fn();
    render(<ConfirmTyped expected="Сала Езеро" label="Избриши сметка" onConfirm={onConfirm} />);
    const button = screen.getByRole("button", { name: "Избриши сметка" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Напишете „Сала Езеро“ за потврда"), { target: { value: "сала езеро" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Напишете „Сала Езеро“ за потврда"), { target: { value: "Сала Езеро" } });
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith("Сала Езеро");
  });
});
```

`tests/components/admin/FeatureOverridesEditor.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FeatureOverridesEditor } from "@/components/admin/FeatureOverridesEditor";
import { FEATURE_KEYS } from "@/lib/entitlements/features";

const features = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { enabled: k !== "seating", limit: k === "max_guests" ? 150 : null }])) as never;

describe("FeatureOverridesEditor", () => {
  it("shows every feature with its resolved value and saves an unlock with a note", async () => {
    const onSave = vi.fn(async () => ({ ok: true as const, data: null }));
    render(<FeatureOverridesEditor scope="event" features={features} overrides={[]} onSave={onSave} />);
    expect(screen.getAllByRole("row").length).toBeGreaterThanOrEqual(11);
    fireEvent.change(screen.getByLabelText("Распоред на седење"), { target: { value: "on" } });
    fireEvent.change(screen.getByLabelText("Белешка за Распоред на седење"), { target: { value: "доплата 3000 ден" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај Распоред на седење" }));
    expect(onSave).toHaveBeenCalledWith({ featureKey: "seating", enabled: true, limitOverride: false, limitValue: null, note: "доплата 3000 ден" });
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`lib/admin/venue-actions-core.ts`:
```ts
import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { deleteVenueAccount } from "@/lib/privacy/erase";
import { FEATURE_KEYS } from "@/lib/entitlements/features";

const uuid = z.string().uuid();
const featureKey = z.enum(FEATURE_KEYS as unknown as [string, ...string[]]);
const db = () => createServiceRoleClient();
const revalidatePathSafe = (p: string) => { try { revalidatePath(p); } catch { /* outside a request (tests) */ } };

async function check<T>(p: PromiseLike<{ error: unknown; data?: T }>) {
  const { error, data } = await p;
  if (error) throw error;
  return data as T;
}

export const venueSchemas = {
  rename: z.object({ venueId: uuid, name: z.string().trim().min(1).max(200) }),
  setPlan: z.object({ venueId: uuid, planId: uuid }),
  saveOverride: z.object({ venueId: uuid, featureKey, enabled: z.boolean().nullable(), limitOverride: z.boolean(), limitValue: z.number().int().min(0).max(1_000_000).nullable(), note: z.string().max(1000).nullable() }),
  staff: z.object({ venueId: uuid, userId: uuid }),
  block: z.object({ venueId: uuid, reason: z.string().trim().min(1, "Внесете причина.").max(1000) }),
  unblock: z.object({ venueId: uuid }),
  remove: z.object({ venueId: uuid, confirmName: z.string() }),
};

export const venueActionCore = {
  async rename(i: z.infer<typeof venueSchemas.rename>, _ctx: AdminContext) {
    await check(db().from("venues").update({ name: i.name }).eq("id", i.venueId));
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_venue_renamed", venueId: i.venueId } };
  },
  async setPlan(i: z.infer<typeof venueSchemas.setPlan>, _ctx: AdminContext) {
    const { data: before } = await db().from("venues").select("plan_id").eq("id", i.venueId).single();
    await check(db().from("venues").update({ plan_id: i.planId }).eq("id", i.venueId));
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_venue_plan_changed", venueId: i.venueId, details: { plan_from: before?.plan_id ?? null, plan_to: i.planId } } };
  },
  async saveOverride(i: z.infer<typeof venueSchemas.saveOverride>, ctx: AdminContext) {
    if (i.enabled === null && !i.limitOverride) {
      await check(db().from("venue_feature_overrides").delete().eq("venue_id", i.venueId).eq("feature_key", i.featureKey));
    } else {
      await check(db().from("venue_feature_overrides").upsert({
        venue_id: i.venueId, feature_key: i.featureKey, enabled: i.enabled, limit_override: i.limitOverride,
        limit_value: i.limitOverride ? i.limitValue : null, note: i.note, updated_at: new Date().toISOString(), updated_by: ctx.adminUserId,
      }));
    }
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_venue_override_saved", venueId: i.venueId, details: { feature: i.featureKey, enabled: i.enabled, limit_override: i.limitOverride, limit: i.limitValue } } };
  },
  async block(i: z.infer<typeof venueSchemas.block>, _ctx: AdminContext) {
    await check(db().from("venues").update({ blocked_at: new Date().toISOString(), blocked_reason: i.reason }).eq("id", i.venueId));
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_venue_blocked", venueId: i.venueId, details: { reason_length: i.reason.length } } };
  },
  async unblock(i: z.infer<typeof venueSchemas.unblock>, _ctx: AdminContext) {
    await check(db().from("venues").update({ blocked_at: null, blocked_reason: null }).eq("id", i.venueId));
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_venue_unblocked", venueId: i.venueId } };
  },
  async remove(i: z.infer<typeof venueSchemas.remove>, ctx: AdminContext) {
    const { data: venue } = await db().from("venues").select("name").eq("id", i.venueId).single();
    if (!venue || venue.name !== i.confirmName) throw new Error("Внесете го точното име на салата.");
    await deleteVenueAccount(i.venueId, { actorId: ctx.adminUserId, requestId: ctx.requestId });
    return { data: null, audit: { action: "admin_venue_deleted", details: { venue_id: i.venueId } } };
  },
  async staffPasswordReset(i: z.infer<typeof venueSchemas.staff>, _ctx: AdminContext) {
    const { data } = await db().auth.admin.getUserById(i.userId);
    if (!data.user?.email) throw new Error("Корисникот нема е-пошта.");
    await check(db().auth.resetPasswordForEmail(data.user.email));
    return { data: null, audit: { action: "admin_staff_password_reset_sent", venueId: i.venueId, targetId: i.userId } };
  },
  async staffRemoveMfa(i: z.infer<typeof venueSchemas.staff>, _ctx: AdminContext) {
    const { data } = await db().auth.admin.mfa.listFactors({ userId: i.userId });
    for (const f of data?.factors ?? []) await check(db().auth.admin.mfa.deleteFactor({ userId: i.userId, id: f.id }));
    return { data: null, audit: { action: "admin_staff_mfa_removed", venueId: i.venueId, targetId: i.userId } };
  },
  async staffSignOut(i: z.infer<typeof venueSchemas.staff>, _ctx: AdminContext) {
    await check(db().rpc("admin_sign_out_user", { p_user_id: i.userId }));
    return { data: null, audit: { action: "admin_staff_signed_out", venueId: i.venueId, targetId: i.userId } };
  },
};

```

`app/admin/(panel)/venues/actions.ts`:
```ts
"use server";

import { adminAction } from "@/lib/admin/actions";
import { venueActionCore as core, venueSchemas as schemas } from "@/lib/admin/venue-actions-core";

export const renameVenue = adminAction(schemas.rename, core.rename);
export const setVenuePlan = adminAction(schemas.setPlan, core.setPlan);
export const saveVenueOverride = adminAction(schemas.saveOverride, core.saveOverride);
export const blockVenue = adminAction(schemas.block, core.block);
export const unblockVenue = adminAction(schemas.unblock, core.unblock);
export const deleteVenue = adminAction(schemas.remove, core.remove);
export const sendStaffPasswordReset = adminAction(schemas.staff, core.staffPasswordReset);
export const removeStaffMfa = adminAction(schemas.staff, core.staffRemoveMfa);
export const signOutStaff = adminAction(schemas.staff, core.staffSignOut);
```
`deleteVenueAccount(venueId, actor: ErasureActor)` is in `lib/privacy/erase.ts`.

`components/admin/ConfirmTyped.tsx`:
```tsx
"use client";
import { useState } from "react";

export function ConfirmTyped({ expected, label, onConfirm, danger = true }: { expected: string; label: string; onConfirm: (typed: string) => void; danger?: boolean }) {
  const [typed, setTyped] = useState("");
  const id = `confirm-${label.replace(/\s+/g, "-")}`;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
      <div>
        <label className="lab-s" htmlFor={id}>{`Напишете „${expected}“ за потврда`}</label>
        <input id={id} className="fld" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      <button type="button" className="btn btn-ghost" style={danger ? { color: "var(--bad)" } : undefined} disabled={typed !== expected} onClick={() => onConfirm(typed)}>
        {label}
      </button>
    </div>
  );
}
```

`components/admin/FeatureOverridesEditor.tsx`:
```tsx
"use client";
import { useState } from "react";
import { FEATURES, type FeatureKey, type FeatureMap } from "@/lib/entitlements/features";
import type { OverrideRow } from "@/lib/admin/queries";
import type { ActionResult } from "@/lib/admin/actions";

type Save = (v: { featureKey: FeatureKey; enabled: boolean | null; limitOverride: boolean; limitValue: number | null; note: string | null }) => Promise<ActionResult<null>>;

export function FeatureOverridesEditor({ scope, features, overrides, onSave }: { scope: "venue" | "event"; features: FeatureMap; overrides: OverrideRow[]; onSave: Save }) {
  const rows = FEATURES.filter((f) => scope === "venue" || f.scope === "event");
  return (
    <table className="tbl">
      <thead><tr><th>Функција</th><th>Важи сега</th><th>Исклучок</th><th>Лимит</th><th>Белешка</th><th /></tr></thead>
      <tbody>{rows.map((f) => <OverrideRowEditor key={f.key} def={f} resolved={features[f.key]} current={overrides.find((o) => o.featureKey === f.key)} onSave={onSave} />)}</tbody>
    </table>
  );
}

function OverrideRowEditor({ def, resolved, current, onSave }: { def: (typeof FEATURES)[number]; resolved: { enabled: boolean; limit: number | null }; current?: OverrideRow; onSave: Save }) {
  const [mode, setMode] = useState(current?.enabled === true ? "on" : current?.enabled === false ? "off" : "inherit");
  const [limitOverride, setLimitOverride] = useState(current?.limitOverride ?? false);
  const [limit, setLimit] = useState(current?.limitValue?.toString() ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    const result = await onSave({
      featureKey: def.key,
      enabled: mode === "inherit" ? null : mode === "on",
      limitOverride,
      limitValue: limitOverride && limit !== "" ? Number(limit) : null,
      note: note.trim() || null,
    });
    setStatus(result.ok ? "Зачувано." : result.error);
  }

  return (
    <tr>
      <td>{def.label}</td>
      <td>{resolved.enabled ? "Отклучено" : "Заклучено"}{def.kind === "limit" ? ` · ${resolved.limit ?? "без лимит"}` : ""}</td>
      <td>
        <select className="fld" aria-label={def.label} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="inherit">Од нивото</option>
          <option value="on">Отклучи</option>
          <option value="off">Заклучи</option>
        </select>
      </td>
      <td>
        {def.kind === "limit" ? (
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" aria-label={`Промени лимит за ${def.label}`} checked={limitOverride} onChange={(e) => setLimitOverride(e.target.checked)} />
            <input className="fld" type="number" min={0} aria-label={`Лимит за ${def.label}`} placeholder="без лимит" disabled={!limitOverride} value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 110 }} />
          </span>
        ) : "—"}
      </td>
      <td><input className="fld" aria-label={`Белешка за ${def.label}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></td>
      <td><button type="button" className="btn btn-ghost" onClick={save} aria-label={`Зачувај ${def.label}`}>Зачувај</button>{status ? <span className="muted"> {status}</span> : null}</td>
    </tr>
  );
}
```

`components/admin/ActionButton.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/admin/actions";

export function ActionButton({ label, action, confirm }: { label: string; action: () => Promise<ActionResult<unknown>>; confirm?: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span>
      <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => { const r = await action(); setMessage(r.ok ? "Готово." : r.error); });
      }}>{label}</button>
      {message ? <span className="muted"> {message}</span> : null}
    </span>
  );
}
```

`components/admin/VenueAdminPanels.tsx` (full): sections *Основни* (rename form → `renameVenue`), *Ниво* (select → `setVenuePlan`), *Функции* (`<FeatureOverridesEditor scope="venue" … onSave={(v) => saveVenueOverride({ venueId: venue.id, ...v })} />`), *Вработени* (table with `ActionButton`s calling `sendStaffPasswordReset`, `removeStaffMfa` (confirm „Отстрани ја двофакторската автентикација?“), `signOutStaff`), *Статус* (reason input + `blockVenue`, or `unblockVenue` when blocked), *Бришење* (`<ConfirmTyped expected={venue.name} label="Избриши сметка" onConfirm={(t) => deleteVenue({ venueId: venue.id, confirmName: t }).then((r) => r.ok && router.push("/admin/venues"))} />`). Import the actions from `@/app/admin/(panel)/venues/actions`.

- [ ] **Step 4: Run** `npx vitest run -c vitest.db.config.ts tests/supabase/admin_venue_actions.test.ts && npx vitest run tests/components/admin tests/security/admin-static.test.ts && npm run typecheck && npm run build` — Expected: PASS.

- [ ] **Step 5: Commit (user runs)**
```bash
git add app/admin/\(panel\)/venues lib/admin/venue-actions-core.ts components/admin tests/supabase/admin_venue_actions.test.ts tests/components/admin
git commit -m "feat(admin): venue plan, feature overrides, staff support actions, block and delete"
```

### Task 3.4: Plans — list, create, edit, delete

**Files:**
- Create: `app/admin/(panel)/plans/page.tsx`, `app/admin/(panel)/plans/[id]/page.tsx`, `app/admin/(panel)/plans/actions.ts`, `lib/admin/plan-actions-core.ts`, `components/admin/PlanFeaturesEditor.tsx`
- Test: `tests/supabase/admin_plan_actions.test.ts`, `tests/components/admin/PlanFeaturesEditor.test.tsx`

**Interfaces:**
- Produces: `planActionCore = { create, update, setFeatures, remove, makeDefault }` in `lib/admin/plan-actions-core.ts`; actions `createPlan({ name, description, sortOrder })` → `{ id }`, `updatePlan({ planId, name, description, sortOrder })`, `setPlanFeatures({ planId, features: { featureKey, enabled, limitValue }[] })` (replaces all 26 rows), `deletePlan({ planId })`, `makeDefaultPlan({ planId })`.
- Rules: `deletePlan` refuses with „Нивото го користат сали. Прво преместете ги.“ when any venue uses it, and „Стандардното ниво не може да се избрише.“ when it is default; `makeDefaultPlan` clears the old default and sets the new one in one RPC-free sequence (clear then set, both service role; a unique partial index protects the invariant); new plans start with every feature locked (explicit rows `enabled false, limit 0` for limits).

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { planActionCore } from "@/lib/admin/plan-actions-core";
import { FEATURE_KEYS } from "@/lib/entitlements/features";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad01", requestId: null };
const created: string[] = [];

afterAll(async () => {
  await admin.from("venues").delete().eq("name", "Plan Action Venue");
  const { data: def } = await admin.from("plans").select("id").eq("name", "Стандарден").single();
  await admin.from("plans").update({ is_default: false }).neq("id", def!.id);
  await admin.from("plans").update({ is_default: true }).eq("id", def!.id);
  if (created.length) await admin.from("plans").delete().in("id", created);
});

describe("plan actions (spec §5)", () => {
  it("creates a plan with every feature locked and edits its features", async () => {
    const { data } = await planActionCore.create({ name: `Basic ${Date.now()}`, description: null, sortOrder: 1 }, ctx);
    created.push(data.id);
    const { data: rows } = await admin.from("plan_features").select("feature_key, enabled").eq("plan_id", data.id);
    expect(rows).toHaveLength(FEATURE_KEYS.length);
    expect(rows!.every((r) => r.enabled === false)).toBe(true);
    await planActionCore.setFeatures({ planId: data.id, features: [{ featureKey: "invitation", enabled: true, limitValue: null }, { featureKey: "max_guests", enabled: true, limitValue: 150 }] }, ctx);
    const { data: after } = await admin.from("plan_features").select("feature_key, enabled, limit_value").eq("plan_id", data.id).in("feature_key", ["invitation", "max_guests", "seating"]);
    expect(after).toEqual(expect.arrayContaining([
      { feature_key: "invitation", enabled: true, limit_value: null },
      { feature_key: "max_guests", enabled: true, limit_value: 150 },
      { feature_key: "seating", enabled: false, limit_value: null },
    ]));
  });

  it("refuses to delete a plan in use or the default plan", async () => {
    const id = created[0];
    await admin.from("venues").insert({ name: "Plan Action Venue", plan_id: id });
    await expect(planActionCore.remove({ planId: id }, ctx)).rejects.toThrow("Нивото го користат сали. Прво преместете ги.");
    const { data: def } = await admin.from("plans").select("id").eq("is_default", true).single();
    await expect(planActionCore.remove({ planId: def!.id }, ctx)).rejects.toThrow("Стандардното ниво не може да се избрише.");
  });

  it("moves the default flag", async () => {
    await planActionCore.makeDefault({ planId: created[0] }, ctx);
    const { data } = await admin.from("plans").select("id").eq("is_default", true);
    expect(data).toEqual([{ id: created[0] }]);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** `lib/admin/plan-actions-core.ts`:
```ts
import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { FEATURE_KEYS, featureDef, type FeatureKey } from "@/lib/entitlements/features";

const db = () => createServiceRoleClient();
const revalidate = (p: string) => { try { revalidatePath(p); } catch { /* outside a request (tests) */ } };
async function check(p: PromiseLike<{ error: unknown }>) { const { error } = await p; if (error) throw error; }

const uuid = z.string().uuid();
const featureKey = z.enum(FEATURE_KEYS as unknown as [string, ...string[]]);
export const planSchemas = {
  create: z.object({ name: z.string().trim().min(1, "Внесете име.").max(100), description: z.string().max(1000).nullable(), sortOrder: z.number().int().min(0).max(1000) }),
  update: z.object({ planId: uuid, name: z.string().trim().min(1).max(100), description: z.string().max(1000).nullable(), sortOrder: z.number().int().min(0).max(1000) }),
  setFeatures: z.object({ planId: uuid, features: z.array(z.object({ featureKey, enabled: z.boolean(), limitValue: z.number().int().min(0).max(1_000_000).nullable() })).max(FEATURE_KEYS.length) }),
  id: z.object({ planId: uuid }),
};

export const planActionCore = {
  async create(i: z.infer<typeof planSchemas.create>, _ctx: AdminContext) {
    const { data, error } = await db().from("plans").insert({ name: i.name, description: i.description, sort_order: i.sortOrder }).select("id").single();
    if (error) throw error.code === "23505" ? new Error("Веќе постои ниво со тоа име.") : error;
    await check(db().from("plan_features").insert(FEATURE_KEYS.map((k) => ({ plan_id: data.id, feature_key: k, enabled: false, limit_value: featureDef(k).kind === "limit" ? 0 : null }))));
    revalidate("/admin/plans");
    return { data: { id: data.id as string }, audit: { action: "admin_plan_created", targetId: data.id } };
  },
  async update(i: z.infer<typeof planSchemas.update>, _ctx: AdminContext) {
    await check(db().from("plans").update({ name: i.name, description: i.description, sort_order: i.sortOrder }).eq("id", i.planId));
    revalidate(`/admin/plans/${i.planId}`);
    return { data: null, audit: { action: "admin_plan_updated", targetId: i.planId } };
  },
  async setFeatures(i: z.infer<typeof planSchemas.setFeatures>, _ctx: AdminContext) {
    const byKey = new Map(i.features.map((f) => [f.featureKey as FeatureKey, f]));
    await check(db().from("plan_features").upsert(FEATURE_KEYS.map((k) => {
      const f = byKey.get(k);
      return { plan_id: i.planId, feature_key: k, enabled: f?.enabled ?? false, limit_value: featureDef(k).kind === "limit" ? f?.limitValue ?? null : null };
    })));
    revalidate(`/admin/plans/${i.planId}`);
    return { data: null, audit: { action: "admin_plan_features_saved", targetId: i.planId, details: { enabled: i.features.filter((f) => f.enabled).length } } };
  },
  async remove(i: z.infer<typeof planSchemas.id>, _ctx: AdminContext) {
    const { data: plan } = await db().from("plans").select("is_default").eq("id", i.planId).single();
    if (plan?.is_default) throw new Error("Стандардното ниво не може да се избрише.");
    const { count } = await db().from("venues").select("id", { count: "exact", head: true }).eq("plan_id", i.planId);
    if ((count ?? 0) > 0) throw new Error("Нивото го користат сали. Прво преместете ги.");
    await check(db().from("plans").delete().eq("id", i.planId));
    revalidate("/admin/plans");
    return { data: null, audit: { action: "admin_plan_deleted", targetId: i.planId } };
  },
  async makeDefault(i: z.infer<typeof planSchemas.id>, _ctx: AdminContext) {
    await check(db().from("plans").update({ is_default: false }).eq("is_default", true));
    await check(db().from("plans").update({ is_default: true }).eq("id", i.planId));
    revalidate("/admin/plans");
    return { data: null, audit: { action: "admin_plan_made_default", targetId: i.planId } };
  },
};
```
`app/admin/(panel)/plans/actions.ts`:
```ts
"use server";
import { adminAction } from "@/lib/admin/actions";
import { planActionCore, planSchemas } from "@/lib/admin/plan-actions-core";

export const createPlan = adminAction(planSchemas.create, planActionCore.create);
export const updatePlan = adminAction(planSchemas.update, planActionCore.update);
export const setPlanFeatures = adminAction(planSchemas.setFeatures, planActionCore.setFeatures);
export const deletePlan = adminAction(planSchemas.id, planActionCore.remove);
export const makeDefaultPlan = adminAction(planSchemas.id, planActionCore.makeDefault);
```
`components/admin/PlanFeaturesEditor.tsx`: a table of all `FEATURES` with a checkbox (aria-label = feature label) and, for limit features, a number input (aria-label „Лимит за …“, empty = unlimited), one „Зачувај“ button calling `onSave(features)` with the full array. Test (`tests/components/admin/PlanFeaturesEditor.test.tsx`):
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlanFeaturesEditor } from "@/components/admin/PlanFeaturesEditor";

describe("PlanFeaturesEditor", () => {
  it("saves every feature with switches and limits", () => {
    const onSave = vi.fn(async () => ({ ok: true as const, data: null }));
    render(<PlanFeaturesEditor initial={{ invitation: { enabled: true, limit: null } }} onSave={onSave} />);
    fireEvent.click(screen.getByLabelText("Распоред на седење"));
    fireEvent.click(screen.getByLabelText("Максимален број гости"));
    fireEvent.change(screen.getByLabelText("Лимит за Максимален број гости"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
    const saved = onSave.mock.calls[0][0] as { featureKey: string; enabled: boolean; limitValue: number | null }[];
    expect(saved).toHaveLength(26);
    expect(saved.find((f) => f.featureKey === "seating")!.enabled).toBe(true);
    expect(saved.find((f) => f.featureKey === "max_guests")).toEqual({ featureKey: "max_guests", enabled: true, limitValue: 150 });
  });
});
```
Implementation:
```tsx
"use client";
import { useState } from "react";
import { FEATURES, type FeatureKey } from "@/lib/entitlements/features";
import type { ActionResult } from "@/lib/admin/actions";

type Value = { enabled: boolean; limit: string };

export function PlanFeaturesEditor({ initial, onSave }: { initial: Record<string, { enabled: boolean; limit: number | null }>; onSave: (f: { featureKey: FeatureKey; enabled: boolean; limitValue: number | null }[]) => Promise<ActionResult<null>> }) {
  const [values, setValues] = useState<Record<string, Value>>(() => Object.fromEntries(FEATURES.map((f) => [f.key, { enabled: initial[f.key]?.enabled ?? false, limit: initial[f.key]?.limit?.toString() ?? "" }])));
  const [status, setStatus] = useState<string | null>(null);
  const set = (k: string, v: Partial<Value>) => setValues((s) => ({ ...s, [k]: { ...s[k], ...v } }));
  return (
    <div>
      <table className="tbl"><tbody>
        {FEATURES.map((f) => (
          <tr key={f.key}>
            <td><label><input type="checkbox" aria-label={f.label} checked={values[f.key].enabled} onChange={(e) => set(f.key, { enabled: e.target.checked })} /> {f.label}</label></td>
            <td>{f.kind === "limit" ? <input className="fld" type="number" min={0} aria-label={`Лимит за ${f.label}`} placeholder="без лимит" value={values[f.key].limit} onChange={(e) => set(f.key, { limit: e.target.value })} /> : null}</td>
          </tr>
        ))}
      </tbody></table>
      <button type="button" className="btn btn-gold" onClick={async () => {
        const r = await onSave(FEATURES.map((f) => ({ featureKey: f.key, enabled: values[f.key].enabled, limitValue: f.kind === "limit" && values[f.key].limit !== "" ? Number(values[f.key].limit) : null })));
        setStatus(r.ok ? "Зачувано." : r.error);
      }}>Зачувај</button>
      {status ? <span className="muted"> {status}</span> : null}
    </div>
  );
}
```
Pages: `plans/page.tsx` lists `listPlans()` (name, default badge, venue count, link to detail) and a create form (client component calling `createPlan` then `router.push(/admin/plans/${id})`); `plans/[id]/page.tsx` shows the name/description/order form (`updatePlan`), `PlanFeaturesEditor` (`setPlanFeatures`), „Направи стандардно“ (`makeDefaultPlan`) and „Избриши“ via `ConfirmTyped` (`deletePlan`).

- [ ] **Step 4: Run** `npx vitest run -c vitest.db.config.ts tests/supabase/admin_plan_actions.test.ts && npx vitest run tests/components/admin tests/security && npm run typecheck && npm run build` — Expected: PASS.

- [ ] **Step 5: Commit (user runs)**
```bash
git add app/admin/\(panel\)/plans lib/admin/plan-actions-core.ts components/admin/PlanFeaturesEditor.tsx tests/supabase/admin_plan_actions.test.ts tests/components/admin/PlanFeaturesEditor.test.tsx
git commit -m "feat(admin): build plans with feature switches and limits"
```

### Task 3.5: Events — list, detail, benefits, couple access

**Files:**
- Create: `app/admin/(panel)/events/page.tsx`, `app/admin/(panel)/events/[id]/page.tsx`, `app/admin/(panel)/events/actions.ts`, `lib/admin/event-actions-core.ts`, `components/admin/EventAdminPanels.tsx`
- Test: `tests/supabase/admin_event_actions.test.ts`

**Interfaces:**
- Produces: `eventActionCore = { update, saveOverride, unlockCouple, regenerateCouplePassword }`; actions `updateEvent({ eventId, date, startTime, endTime, status })`, `saveEventOverride({ eventId, featureKey (event-scope only), enabled, limitOverride, limitValue, note })`, `unlockCoupleLogin({ eventId })`, `regenerateCouplePassword({ eventId })` → `{ password }` (12 chars via `generateRandomPassword` from `lib/venue/credentials.ts`; shown once in the UI, never logged).

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { eventActionCore } from "@/lib/admin/event-actions-core";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad01", requestId: null };
let venueId: string;
let eventId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: "Event Action Venue" }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "EA & Test", event_date: "2028-08-01" }).select("id").single()).data!.id;
  await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: `ea-${Date.now()}`, p_password: "long-enough-55" });
});
afterAll(async () => { await admin.from("venues").delete().eq("id", venueId); });

describe("admin event actions", () => {
  it("updates date, times and status", async () => {
    await eventActionCore.update({ eventId, date: "2028-08-02", startTime: "18:00", endTime: "01:00", status: "confirmed" }, ctx);
    expect((await admin.from("events").select("event_date, status").eq("id", eventId).single()).data).toEqual({ event_date: "2028-08-02", status: "confirmed" });
  });

  it("grants an extra benefit to one event", async () => {
    const r = await eventActionCore.saveOverride({ eventId, featureKey: "seating", enabled: true, limitOverride: false, limitValue: null, note: "договор 12.10" }, ctx);
    expect(r.audit).toMatchObject({ action: "admin_event_override_saved", eventId, venueId });
    expect((await admin.rpc("event_has_feature", { p_event_id: eventId, p_key: "seating" })).data).toBe(true);
  });

  it("refuses venue-scope features on an event", async () => {
    await expect(eventActionCore.saveOverride({ eventId, featureKey: "reservations" as never, enabled: true, limitOverride: false, limitValue: null, note: null }, ctx)).rejects.toThrow();
  });

  it("regenerates the couple password (≥10 chars) and ends couple sessions", async () => {
    const { data } = await eventActionCore.regenerateCouplePassword({ eventId }, ctx);
    expect(data.password.length).toBeGreaterThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** `lib/admin/event-actions-core.ts`:
```ts
import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { FEATURES } from "@/lib/entitlements/features";
import { generateRandomPassword } from "@/lib/venue/credentials";

const db = () => createServiceRoleClient();
const revalidate = (p: string) => { try { revalidatePath(p); } catch { /* tests */ } };
async function check(p: PromiseLike<{ error: unknown }>) { const { error } = await p; if (error) throw error; }
const uuid = z.string().uuid();
const eventFeature = z.enum(FEATURES.filter((f) => f.scope === "event").map((f) => f.key) as [string, ...string[]]);
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable();

export const eventSchemas = {
  update: z.object({ eventId: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime: time, endTime: time, status: z.enum(["preparation", "confirmed", "in_progress", "completed", "cancelled"]) }),
  saveOverride: z.object({ eventId: uuid, featureKey: eventFeature, enabled: z.boolean().nullable(), limitOverride: z.boolean(), limitValue: z.number().int().min(0).max(1_000_000).nullable(), note: z.string().max(1000).nullable() }),
  id: z.object({ eventId: uuid }),
};

async function venueOf(eventId: string): Promise<string> {
  const { data, error } = await db().from("events").select("venue_id").eq("id", eventId).single();
  if (error) throw error;
  return data.venue_id;
}

export const eventActionCore = {
  async update(i: z.infer<typeof eventSchemas.update>, _ctx: AdminContext) {
    await check(db().from("events").update({ event_date: i.date, start_time: i.startTime, end_time: i.endTime, status: i.status }).eq("id", i.eventId));
    revalidate(`/admin/events/${i.eventId}`);
    return { data: null, audit: { action: "admin_event_updated", eventId: i.eventId, venueId: await venueOf(i.eventId), details: { status: i.status } } };
  },
  async saveOverride(i: z.infer<typeof eventSchemas.saveOverride>, ctx: AdminContext) {
    eventSchemas.saveOverride.parse(i);
    if (i.enabled === null && !i.limitOverride) {
      await check(db().from("event_feature_overrides").delete().eq("event_id", i.eventId).eq("feature_key", i.featureKey));
    } else {
      await check(db().from("event_feature_overrides").upsert({
        event_id: i.eventId, feature_key: i.featureKey, enabled: i.enabled, limit_override: i.limitOverride,
        limit_value: i.limitOverride ? i.limitValue : null, note: i.note, updated_at: new Date().toISOString(), updated_by: ctx.adminUserId,
      }));
    }
    revalidate(`/admin/events/${i.eventId}`);
    return { data: null, audit: { action: "admin_event_override_saved", eventId: i.eventId, venueId: await venueOf(i.eventId), details: { feature: i.featureKey, enabled: i.enabled, limit_override: i.limitOverride, limit: i.limitValue } } };
  },
  async unlockCouple(i: z.infer<typeof eventSchemas.id>, _ctx: AdminContext) {
    await check(db().rpc("admin_unlock_couple_login", { p_event_id: i.eventId }));
    return { data: null, audit: { action: "admin_couple_login_unlocked", eventId: i.eventId, venueId: await venueOf(i.eventId) } };
  },
  async regenerateCouplePassword(i: z.infer<typeof eventSchemas.id>, _ctx: AdminContext) {
    const password = generateRandomPassword();
    await check(db().rpc("regenerate_event_password", { p_event_id: i.eventId, p_password: password }));
    return { data: { password }, audit: { action: "admin_couple_password_regenerated", eventId: i.eventId, venueId: await venueOf(i.eventId) } };
  },
};
```
`app/admin/(panel)/events/actions.ts` wraps each with `adminAction(eventSchemas.x, eventActionCore.x)` (names `updateEvent`, `saveEventOverride`, `unlockCoupleLogin`, `regenerateCouplePassword`). `events/page.tsx` lists `listEvents({ venueId, from, to, status })` from search params with a filter form and links to `/admin/events/[id]`; `events/[id]/page.tsx` loads `getEventDetail`, `getEventOverrides`, `getEventFeatures` and renders `EventAdminPanels` (edit form → `updateEvent`; `<FeatureOverridesEditor scope="event" … onSave={(v) => saveEventOverride({ eventId, ...v })} />` titled „Бенефиции за настанот“; `ActionButton` „Отклучи најава на парот“ → `unlockCoupleLogin`; „Нова лозинка за парот“ → `regenerateCouplePassword`, showing the returned password once in a highlighted box with the note „Зачувајте ја сега — нема повторно да се прикаже.“).

- [ ] **Step 4: Run** `npx vitest run -c vitest.db.config.ts tests/supabase/admin_event_actions.test.ts && npx vitest run tests/security/admin-static.test.ts tests/components/admin && npm run typecheck && npm run build` — Expected: PASS.

- [ ] **Step 5: Commit (user runs)**
```bash
git add app/admin/\(panel\)/events lib/admin/event-actions-core.ts components/admin/EventAdminPanels.tsx tests/supabase/admin_event_actions.test.ts
git commit -m "feat(admin): events across venues, per-event benefits, couple access support"
```

### Task 3.6: Phase 3 gate

- [ ] `npm run typecheck && npm run lint && npm run test:unit && npm run test:db && npx playwright test` — Expected: PASS.

---

## Phase 4 — Messages, audit, system, E2E

### Task 4.1: Contact message status and platform settings

**Files:**
- Create: `supabase/migrations/0050_contact_status_and_settings.sql`, `lib/platform-settings.ts`, `app/admin/(panel)/messages/page.tsx`, `app/admin/(panel)/messages/actions.ts`, `lib/admin/message-actions-core.ts`
- Modify: `proxy.ts` (`maintenanceResponse` reads DB flag), `lib/admin/queries.ts` (`newMessages` filter `status = 'new'`), `tests/supabase/privacy-classification.ts`, `tests/supabase/rls_guard.test.ts`
- Test: `tests/supabase/admin_messages.test.ts`, `tests/supabase/platform_settings.test.ts`

**Interfaces:**
- SQL: `contact_submissions.status text not null default 'new' check (status in ('new','read','answered'))`, `contact_submissions.handled_at timestamptz`; `platform_settings(id boolean primary key default true check (id), maintenance_mode boolean not null default false, updated_at timestamptz not null default now(), updated_by uuid)` with the single row inserted.
- TS: `getMaintenanceMode(): Promise<boolean>` (30-second in-memory cache, fail-open to `false` on error); `invalidateMaintenanceCache(): void`; actions `setMessageStatus({ id, status })`, `deleteMessage({ id })`, `setMaintenanceMode({ enabled })`.
- `maintenanceResponse` becomes `async` and treats `process.env.MAINTENANCE_MODE === "1" || await getMaintenanceMode()` as on; `proxy()` awaits it.

Contact submissions are the platform's own data (not a venue's), so listing name/email/message here is allowed (spec §5 item 5); add `"contact_submissions"` to an explicit allow-list comment in `tests/security/admin-static.test.ts` (it is not in PRIVATE_TABLES).

- [ ] **Step 1: Write the failing tests**

`tests/supabase/platform_settings.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMaintenanceMode, invalidateMaintenanceCache } from "@/lib/platform-settings";
import { proxy } from "@/proxy";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
afterAll(async () => { await admin.from("platform_settings").update({ maintenance_mode: false }).eq("id", true); invalidateMaintenanceCache(); });

describe("maintenance flag in the database (spec §5 item 7)", () => {
  it("turns the maintenance page on for the main site but not the admin host", async () => {
    await admin.from("platform_settings").update({ maintenance_mode: true }).eq("id", true);
    invalidateMaintenanceCache();
    expect(await getMaintenanceMode()).toBe(true);
    expect((await proxy(new NextRequest("http://localhost:3000/", { headers: { host: "localhost:3000" } }))).status).toBe(503);
    expect((await proxy(new NextRequest("http://admin.localhost:3000/", { headers: { host: "admin.localhost:3000" } }))).status).toBe(200);
  });
  it("fails open when the database is unreachable", async () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:59999";
    invalidateMaintenanceCache();
    try { expect(await getMaintenanceMode()).toBe(false); } finally { process.env.NEXT_PUBLIC_SUPABASE_URL = original; invalidateMaintenanceCache(); }
  }, 20_000);
});
```

`tests/supabase/admin_messages.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { messageActionCore } from "@/lib/admin/message-actions-core";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad01", requestId: null };

describe("contact message handling", () => {
  it("marks read/answered with a timestamp and deletes", async () => {
    const { data } = await admin.from("contact_submissions").insert({ name: "Nova Sala", email: "msg@test.local", message: "Здраво" }).select("id, status").single();
    expect(data!.status).toBe("new");
    await messageActionCore.setStatus({ id: data!.id, status: "answered" }, ctx);
    const { data: after } = await admin.from("contact_submissions").select("status, handled_at").eq("id", data!.id).single();
    expect(after!.status).toBe("answered");
    expect(after!.handled_at).not.toBeNull();
    await messageActionCore.remove({ id: data!.id }, ctx);
    expect((await admin.from("contact_submissions").select("id").eq("id", data!.id)).data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement**

`supabase/migrations/0050_contact_status_and_settings.sql`:
```sql
-- 0050: contact message handling and DB-stored platform settings (admin spec §5).
alter table public.contact_submissions
  add column status text not null default 'new' check (status in ('new', 'read', 'answered')),
  add column handled_at timestamptz;

create table public.platform_settings (
  id boolean primary key default true check (id),
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.platform_settings (id) values (true);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant all on public.platform_settings to service_role;
```

`lib/platform-settings.ts`:
```ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const TTL_MS = 30_000;
let cached: { value: boolean; at: number } | null = null;

export function invalidateMaintenanceCache(): void {
  cached = null;
}

/** DB maintenance flag (admin → Систем), cached 30 s; fails open. */
export async function getMaintenanceMode(): Promise<boolean> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const { data, error } = await createServiceRoleClient()
      .from("platform_settings").select("maintenance_mode").eq("id", true)
      .abortSignal(AbortSignal.timeout(1500)).single();
    if (error) throw error;
    cached = { value: data.maintenance_mode === true, at: Date.now() };
  } catch {
    cached = { value: false, at: Date.now() };
  }
  return cached.value;
}
```
`proxy.ts`: make `maintenanceResponse` async:
```ts
export async function maintenanceResponse(request: NextRequest): Promise<NextResponse | null> {
  if (process.env.MAINTENANCE_MODE !== "1" && !(await getMaintenanceMode())) return null;
  // …rest unchanged
}
```
and in `proxy()`: `const maintenance = await maintenanceResponse(request);`. Update `tests/security/middleware.test.ts` maintenance tests to `await` (they already `await middleware(...)`; the exported `maintenanceResponse` is only used via `proxy`). Mock `@/lib/platform-settings` in `tests/security/*.test.ts` files that import `@/proxy`:
```ts
vi.mock("@/lib/platform-settings", () => ({ getMaintenanceMode: async () => false, invalidateMaintenanceCache: () => {} }));
```

`lib/admin/message-actions-core.ts`:
```ts
import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { invalidateMaintenanceCache } from "@/lib/platform-settings";

const db = () => createServiceRoleClient();
const revalidate = (p: string) => { try { revalidatePath(p); } catch { /* tests */ } };
async function check(p: PromiseLike<{ error: unknown }>) { const { error } = await p; if (error) throw error; }
const messageId = z.string().uuid();

export const messageSchemas = {
  setStatus: z.object({ id: messageId, status: z.enum(["new", "read", "answered"]) }),
  id: z.object({ id: messageId }),
  maintenance: z.object({ enabled: z.boolean() }),
};

export const messageActionCore = {
  async setStatus(i: z.infer<typeof messageSchemas.setStatus>, _ctx: AdminContext) {
    await check(db().from("contact_submissions").update({ status: i.status, handled_at: i.status === "new" ? null : new Date().toISOString() }).eq("id", i.id));
    revalidate("/admin/messages");
    return { data: null, audit: { action: "admin_message_status", targetId: null, details: { status: i.status } } };
  },
  async remove(i: z.infer<typeof messageSchemas.id>, _ctx: AdminContext) {
    await check(db().from("contact_submissions").delete().eq("id", i.id));
    revalidate("/admin/messages");
    return { data: null, audit: { action: "admin_message_deleted" } };
  },
  async setMaintenance(i: z.infer<typeof messageSchemas.maintenance>, ctx: AdminContext) {
    await check(db().from("platform_settings").update({ maintenance_mode: i.enabled, updated_at: new Date().toISOString(), updated_by: ctx.adminUserId }).eq("id", true));
    invalidateMaintenanceCache();
    revalidate("/admin/system");
    return { data: null, audit: { action: i.enabled ? "admin_maintenance_on" : "admin_maintenance_off" } };
  },
};
```
`app/admin/(panel)/messages/actions.ts` exports `setMessageStatus`, `deleteMessage`; `app/admin/(panel)/system/actions.ts` exports `setMaintenanceMode` — each `adminAction(schema, core)`. `messages/page.tsx`: table of `contact_submissions` (created_at, name, email as `mailto:` link, message, status select via `ActionButton`s „Прочитано“/„Одговорено“, „Избриши“ with confirm), filter by status from search params, ordered newest first, limit 500. Add `/admin/system` page: current state of `getMaintenanceMode()` and env flag, `ActionButton` to toggle, release SHA from `process.env.RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"`.

- [ ] **Step 4: Run** `psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f <this task's migration> && npx vitest run -c vitest.db.config.ts tests/supabase/platform_settings.test.ts tests/supabase/admin_messages.test.ts tests/supabase/rls_guard.test.ts tests/supabase/privacy_guard.test.ts && npx vitest run tests/security && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit (user runs)**
```bash
git add supabase/migrations/0050_contact_status_and_settings.sql lib/platform-settings.ts lib/admin/message-actions-core.ts app/admin/\(panel\)/messages app/admin/\(panel\)/system proxy.ts lib/admin/queries.ts tests/supabase/platform_settings.test.ts tests/supabase/admin_messages.test.ts tests/supabase/privacy-classification.ts tests/supabase/rls_guard.test.ts tests/security
git commit -m "feat(admin): contact message handling and maintenance mode from the dashboard"
```

### Task 4.2: Audit log viewer

**Files:**
- Create: `app/admin/(panel)/audit/page.tsx`
- Test: `tests/components/admin/audit-page.test.tsx`

- [ ] **Step 1: Write the failing test**
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const listAudit = vi.fn(async () => ({ rows: [{ id: 1, occurredAt: "2028-01-01T10:00:00Z", actorType: "admin", actorId: "a", action: "admin_venue_blocked", venueId: "v1", eventId: null, targetId: null, requestId: "r1", details: { reason_length: 9 } }], hasMore: true }));
vi.mock("@/lib/admin/queries", () => ({ listAudit }));

import AuditPage from "@/app/admin/(panel)/audit/page";

describe("audit page", () => {
  it("passes filters through and pages", async () => {
    render(await AuditPage({ searchParams: Promise.resolve({ action: "admin_venue_blocked", page: "2" }) }));
    expect(listAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin_venue_blocked", page: 2 }));
    expect(screen.getByText("admin_venue_blocked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Следна" })).toHaveAttribute("href", expect.stringContaining("page=3"));
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** `app/admin/(panel)/audit/page.tsx`:
```tsx
import Link from "next/link";
import { listAudit } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

type Search = { venue?: string; event?: string; action?: string; actor?: string; from?: string; to?: string; page?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await searchParams;
  const page = Math.max(0, Number(s.page ?? 0) || 0);
  const { rows, hasMore } = await listAudit({ venueId: s.venue, eventId: s.event, action: s.action, actorType: s.actor, from: s.from, to: s.to, page });
  const link = (p: number) => `/admin/audit?${new URLSearchParams({ ...Object.fromEntries(Object.entries(s).filter(([, v]) => v)), page: String(p) } as Record<string, string>)}`;
  return (
    <div className="wrap">
      <form className="panel" style={{ padding: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="fld" name="action" defaultValue={s.action} placeholder="Акција" aria-label="Акција" />
        <select className="fld" name="actor" defaultValue={s.actor ?? ""} aria-label="Актер">
          <option value="">Сите актери</option>
          {["admin", "staff", "couple", "guest", "system"].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input className="fld" name="venue" defaultValue={s.venue} placeholder="ID на сала" aria-label="ID на сала" />
        <input className="fld" type="date" name="from" defaultValue={s.from} aria-label="Од" />
        <input className="fld" type="date" name="to" defaultValue={s.to} aria-label="До" />
        <button className="btn btn-gold" type="submit">Филтрирај</button>
      </form>
      <section className="panel">
        <table className="tbl">
          <thead><tr><th>Време</th><th>Актер</th><th>Акција</th><th>Сала</th><th>Настан</th><th>Детали</th><th>Request</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.occurredAt).toLocaleString("mk-MK", { timeZone: "Europe/Skopje" })}</td>
                <td>{r.actorType}</td>
                <td>{r.action}</td>
                <td>{r.venueId ? <Link href={`/admin/venues/${r.venueId}`}>сала</Link> : "—"}</td>
                <td>{r.eventId ? <Link href={`/admin/events/${r.eventId}`}>настан</Link> : "—"}</td>
                <td><code>{JSON.stringify(r.details)}</code></td>
                <td><code>{r.requestId ?? "—"}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: 12, display: "flex", gap: 12 }}>
          {page > 0 ? <Link href={link(page - 1)}>Претходна</Link> : null}
          {hasMore ? <Link href={link(page + 1)}>Следна</Link> : null}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run** `npx vitest run tests/components/admin && npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit (user runs)**
```bash
git add app/admin/\(panel\)/audit tests/components/admin/audit-page.test.tsx
git commit -m "feat(admin): audit log viewer with filters"
```

### Task 4.3: End-to-end flow, docs, final gate

**Files:**
- Create: `e2e/admin.spec.ts`, `docs/production/ADMIN.md`
- Modify: `e2e/helpers.ts` (admin helpers), `playwright.config.ts` (none expected: `admin.localhost` resolves to 127.0.0.1 in Chromium), `docs/production/SETUP.md` (admin subdomain step), `docs/production/DOMAIN.md` (add `admin.<domain>`), `docs/production/AUTH.md` (redirect URL for admin host), `docs/production/DATA-MAP.md` (new tables/columns), `docs/production/DECISIONS.md` (plans/entitlements row)

**Interfaces:**
- Consumes: everything above; e2e helpers `signUpVenue`, `setUpCouple`, `adminClient`.
- Produces: `createAdminAndSignIn(page): Promise<{ email: string; secret: string }>` in `e2e/helpers.ts` (creates a platform admin with the service role, enrols TOTP via the Supabase API, signs in through `http://admin.localhost:3200/login` with the code computed from the secret using the same RFC 6238 function as the DB tests — put it in `e2e/totp.ts`).

- [ ] **Step 1: Write the E2E spec**
```ts
import { test, expect } from "./fixtures";
import { adminClient, setUpCouple, uniqueId } from "./helpers";
import { createAdminAndSignIn } from "./helpers";

const ADMIN = "http://admin.localhost:3200";

test("main host never serves /admin", async ({ page }) => {
  const res = await page.goto("/admin");
  expect(res!.status()).toBe(404);
});

test("admin builds a plan, locks seating for a venue, then unlocks it for one event", async ({ page, browser }) => {
  const couplePage = await (await browser.newContext()).newPage();
  const couple = await setUpCouple(couplePage);
  const db = adminClient();
  const { data: event } = await db.from("events").select("id, venue_id").eq("couple_names", couple.coupleNames).single();

  await createAdminAndSignIn(page);
  await page.goto(`${ADMIN}/plans`);
  const planName = `Basic ${uniqueId()}`;
  await page.getByLabel("Име на нивото").fill(planName);
  await page.getByRole("button", { name: "Креирај" }).click();
  for (const label of ["Дигитална покана и RSVP", "Буџет", "Чеклиста", "Агенда", "Локации", "Белешки"]) await page.getByLabel(label, { exact: true }).check();
  await page.getByRole("button", { name: "Зачувај" }).click();
  await expect(page.getByText("Зачувано.")).toBeVisible();

  await page.goto(`${ADMIN}/venues/${event!.venue_id}`);
  await page.getByLabel("Ниво").selectOption({ label: planName });
  await expect(page.getByText("Готово.").or(page.getByText("Зачувано."))).toBeVisible();

  const locked = await couplePage.request.post("/api/couple/seating/elements", { data: {} });
  expect(locked.status()).toBe(403);

  await page.goto(`${ADMIN}/events/${event!.id}`);
  await page.getByLabel("Распоред на седење", { exact: true }).selectOption("on");
  await page.getByLabel("Белешка за Распоред на седење").fill("e2e договор");
  await page.getByRole("button", { name: "Зачувај Распоред на седење" }).click();
  await expect(page.getByText("Зачувано.")).toBeVisible();

  const unlocked = await couplePage.request.post("/api/couple/seating/elements", { data: {} });
  expect(unlocked.status()).not.toBe(403);
});
```
Add to the venue detail plan section a `<label htmlFor="venue-plan">Ниво</label>` select that calls `setVenuePlan` on change and shows „Зачувано.“, and to the plans list a create form with label „Име на нивото“ and button „Креирај“ (both introduced in Tasks 3.3/3.4 — make the labels match exactly).

- [ ] **Step 2: Run** `npx playwright test e2e/admin.spec.ts` — Expected: PASS after helpers exist; the CSP fixture must report zero violations on admin pages.

- [ ] **Step 3: Write `docs/production/ADMIN.md`**: who the admin is, how to create them (`node --env-file=<prod env> scripts/make-admin.mjs <email>` run by the owner, never committed), mandatory TOTP and recovery (delete the factor via the Supabase dashboard after identity check), `admin.<domain>` setup (Vercel domain on the same project; Supabase Auth redirect `https://admin.<domain>/**`), what the admin can and cannot see (D2), plans/overrides model with the resolution order and D7, blocking semantics (D8), audit actions list (every `admin_*` action from Tasks 3.3–4.1). Update SETUP.md (new step „Админ поддомен“), DOMAIN.md, AUTH.md, DATA-MAP.md (tables `plans`, `plan_features`, `venue_feature_overrides`, `event_feature_overrides`, `platform_settings`; columns `venues.plan_id/blocked_at/blocked_reason`, `contact_submissions.status/handled_at`; override notes may contain business terms, no personal data), DECISIONS.md (row for plans/entitlements).

- [ ] **Step 4: Final gate** — `npm run typecheck && npm run lint && npm audit --omit=dev --audit-level=high && npm run test:unit:coverage && npm run test:db:coverage && npx playwright test && npm run build` — Expected: all PASS. From-scratch migration check (0001–0059 on an empty DB) happens at the merge step (Session 4 LAUNCH.md), not here.

- [ ] **Step 5: Commit (user runs)**
```bash
git add e2e docs/production
git commit -m "test(admin): end-to-end plan and benefit flow; admin docs"
```
