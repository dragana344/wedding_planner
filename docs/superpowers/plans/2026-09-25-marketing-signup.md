# Marketing Page & Self-Serve Venue Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public marketing homepage at `/` and a self-serve venue signup flow, so a prospect can sign up for their own fully-working venue dashboard without any manual seeding.

**Architecture:** A static-content marketing page at `app/page.tsx` (replacing the current placeholder, preserving `RecoveryRedirect`) with a contact form backed by a new `contact_submissions` table. A `/signup` page that calls Supabase's own client-side `auth.signUp()` and then an idempotent `/api/venue/signup` route that provisions a `venues` + `venue_staff` row for the now-authenticated caller. A one-time static `/welcome` page (outside the `/venue/*` layout, so it does not inherit the full sidebar shell) shown immediately after signup.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Auth), Vitest, the existing `.vp` panel design system (`app/venue/panel.css`).

**Spec:** `docs/superpowers/specs/2026-09-25-marketing-signup-design.md`

## Global Constraints

- No feature entitlements/gating — a self-signed-up venue gets the exact same full dashboard as any other venue.
- No per-venue branding in this plan — every venue still uses the one fixed `.vp` skin.
- Pricing is display-only — no payment processing, no checkout. Placeholder MKD amounts, clearly a preview.
- No email verification on signup — the account is usable immediately after `auth.signUp()` succeeds.
- `venue_staff` is never written by a direct client grant — only `service_role` may write it (see `supabase/migrations/0004_rls_policies.sql`). Provisioning must go through a server route using `createServiceRoleClient()`, and must resolve the caller from their own authenticated session (`createServerSupabaseClient()`), never from a client-supplied user id.
- `/api/venue/signup` must be idempotent: calling it twice for the same already-provisioned user must return the same `venue_id`, never create a second venue.
- New tables follow the existing RLS-enabled / zero-anon-policy / service-role-only pattern (see `supabase/migrations/0023_budget_checklist.sql`'s header comment for the exact convention).
- Next migration number is `0029`.
- Every new couple/venue-facing page needing fresh data on each visit uses `export const dynamic = "force-dynamic"`.
- `npm run build` must succeed as the final verification step.

---

## File structure

- `supabase/migrations/0029_contact_submissions.sql` — new table.
- `lib/venue/contact.ts` — `submitContactMessage()`, service-role-backed.
- `lib/venue/provisioning.ts` — `provisionVenueForUser()`, service-role-backed, idempotent.
- `app/api/venue/contact/route.ts` — public POST route backing the marketing page's contact form.
- `app/api/venue/signup/route.ts` — POST route resolving the caller's session, calling `provisionVenueForUser()`.
- `app/signup/page.tsx` — the signup form, using the existing `AuthScreen` wrapper.
- `app/welcome/page.tsx` — the one-time post-signup checklist screen (top-level route, not under `/venue`, so it never inherits `PanelShell`).
- `app/page.tsx` — replaces the current placeholder homepage.
- `app/venue/panel.css` — new marketing-page section appended (hero, feature grid, pricing cards, contact form), following the file's existing pattern of dated, commented sections.
- Tests: `tests/lib/venue/provisioning.test.ts`, `tests/lib/venue/contact.test.ts`, `tests/components/SignupForm.test.tsx` (component extracted so it's testable without the async server page wrapping it), `tests/app/welcome-page-render.test.tsx` is **not** created — see Task 6's note on why no test is needed there.

**Why `/welcome` and not `/venue/welcome`:** `app/venue/layout.tsx` unconditionally wraps every route under `/venue/*` in the full `PanelShell` sidebar (it redirects to `/login` if there's no venue, then always renders `<PanelShell>{children}</PanelShell>` — there is no way to opt a single nested route out of it). The spec calls for a minimal, chrome-free one-time screen, so this plan places it at the top level instead, alongside `/login` and `/reset-password`, which already live outside `/venue/*` for the same structural reason.

---

## Task 1: `contact_submissions` table

**Files:**
- Create: `supabase/migrations/0029_contact_submissions.sql`

**Interfaces:**
- Produces: table `contact_submissions(id uuid pk, name text, email text, message text, created_at timestamptz)`, RLS enabled, zero anon/authenticated policies, `service_role` granted all — consumed by Task 2's `lib/venue/contact.ts`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0029_contact_submissions.sql
-- Captures the marketing page's contact form. No email/CRM integration
-- exists yet, so submissions are just durably stored for a manual `select`
-- until a real delivery destination is decided. Same access pattern as
-- every couple/venue-facing table added this project: RLS enabled with
-- zero anon/authenticated policies, service_role only — the contact API
-- route is the only thing that ever writes or reads this table.

create table contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table contact_submissions enable row level security;

grant usage on schema public to service_role;
grant all on contact_submissions to service_role;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db reset` (ask the human partner for explicit confirmation first — this wipes and reseeds the local database, per this project's established practice for every migration).

Expected: migration `0029_contact_submissions.sql` applies cleanly along with all prior migrations, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0029_contact_submissions.sql
git commit -m "Add contact_submissions table for the marketing page's contact form"
```

---

## Task 2: Contact form backend

**Files:**
- Create: `lib/venue/contact.ts`
- Create: `app/api/venue/contact/route.ts`
- Test: `tests/lib/venue/contact.test.ts`

**Interfaces:**
- Consumes: `contact_submissions` table from Task 1.
- Produces: `submitContactMessage(input: { name: string; email: string; message: string }): Promise<void>` — consumed by Task 7's marketing page contact form (via the API route, not called directly from client code).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/venue/contact.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { submitContactMessage } from "@/lib/venue/contact";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/venue/contact: submitContactMessage", () => {
  it("stores a contact submission", async () => {
    await submitContactMessage({
      name: "Ана Петровска",
      email: "ana@example.com",
      message: "Ве молиме контактирајте ме за повеќе информации.",
    });

    const { data } = await admin
      .from("contact_submissions")
      .select("*")
      .eq("email", "ana@example.com")
      .single();

    expect(data).not.toBeNull();
    expect(data!.name).toBe("Ана Петровска");
    expect(data!.message).toBe("Ве молиме контактирајте ме за повеќе информации.");

    await admin.from("contact_submissions").delete().eq("email", "ana@example.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/venue/contact.test.ts`
Expected: FAIL — `Cannot find module '@/lib/venue/contact'`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/venue/contact.ts
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface ContactMessageInput {
  name: string;
  email: string;
  message: string;
}

export async function submitContactMessage(input: ContactMessageInput): Promise<void> {
  const client = createServiceRoleClient();
  const { error } = await client.from("contact_submissions").insert({
    name: input.name,
    email: input.email,
    message: input.message,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/venue/contact.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Write the API route (no test — thin pass-through, exercised by Task 7's component test via a mocked `fetch`)**

```typescript
// app/api/venue/contact/route.ts
import { NextRequest, NextResponse } from "next/server";
import { submitContactMessage } from "@/lib/venue/contact";

export async function POST(request: NextRequest) {
  let body: { name?: string; email?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body.name !== "string" || !body.name.trim() ||
    typeof body.email !== "string" || !body.email.trim() ||
    typeof body.message !== "string" || !body.message.trim()
  ) {
    return NextResponse.json({ error: "Name, email, and message are required." }, { status: 400 });
  }

  try {
    await submitContactMessage({ name: body.name, email: body.email, message: body.message });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to send message." }, { status: 400 });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/venue/contact.ts app/api/venue/contact/route.ts tests/lib/venue/contact.test.ts
git commit -m "Add contact form backend for the marketing page"
```

---

## Task 3: Venue provisioning (signup backend)

**Files:**
- Create: `lib/venue/provisioning.ts`
- Create: `app/api/venue/signup/route.ts`
- Test: `tests/lib/venue/provisioning.test.ts`

**Interfaces:**
- Consumes: `venues`, `venue_staff` tables (existing schema, no changes).
- Produces: `provisionVenueForUser(userId: string, venueName: string): Promise<{ venue_id: string }>` — consumed by the API route in this task, which is in turn consumed by Task 5's signup page.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/venue/provisioning.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { provisionVenueForUser } from "@/lib/venue/provisioning";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/venue/provisioning: provisionVenueForUser", () => {
  it("creates a venue and links the given user as staff", async () => {
    const { data: user } = await admin.auth.admin.createUser({
      email: "provision-test-1@test.local",
      password: "test-password-123",
      email_confirm: true,
    });

    const result = await provisionVenueForUser(user!.user!.id, "Нов Локал");
    expect(result.venue_id).toBeTruthy();

    const { data: venue } = await admin.from("venues").select("name").eq("id", result.venue_id).single();
    expect(venue!.name).toBe("Нов Локал");

    const { data: staffRow } = await admin
      .from("venue_staff")
      .select("venue_id")
      .eq("user_id", user!.user!.id)
      .single();
    expect(staffRow!.venue_id).toBe(result.venue_id);

    await admin.from("venues").delete().eq("id", result.venue_id);
    await admin.auth.admin.deleteUser(user!.user!.id);
  });

  it("is idempotent — calling it again for an already-provisioned user returns the same venue, not a second one", async () => {
    const { data: user } = await admin.auth.admin.createUser({
      email: "provision-test-2@test.local",
      password: "test-password-123",
      email_confirm: true,
    });

    const first = await provisionVenueForUser(user!.user!.id, "Прв обид");
    const second = await provisionVenueForUser(user!.user!.id, "Втор обид (би требало да се игнорира)");

    expect(second.venue_id).toBe(first.venue_id);

    const { count } = await admin
      .from("venue_staff")
      .select("venue_id", { count: "exact", head: true })
      .eq("user_id", user!.user!.id);
    expect(count).toBe(1);

    await admin.from("venues").delete().eq("id", first.venue_id);
    await admin.auth.admin.deleteUser(user!.user!.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/venue/provisioning.test.ts`
Expected: FAIL — `Cannot find module '@/lib/venue/provisioning'`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/venue/provisioning.ts
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Creates a venue for a brand-new self-signed-up user and links them as its
 * staff, in one operation. Idempotent: if the given user already has a
 * venue_staff row (e.g. this is a retry after a prior partial failure), that
 * existing venue's id is returned instead of creating a second venue.
 *
 * Always uses the service-role client — venue_staff is never written via a
 * direct client grant (see supabase/migrations/0004_rls_policies.sql) — and
 * always takes an already-resolved userId from the caller's own session,
 * never a client-supplied value.
 */
export async function provisionVenueForUser(userId: string, venueName: string): Promise<{ venue_id: string }> {
  const client = createServiceRoleClient();

  const { data: existing, error: existingError } = await client
    .from("venue_staff")
    .select("venue_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { venue_id: existing.venue_id };

  const { data: venue, error: venueError } = await client
    .from("venues")
    .insert({ name: venueName })
    .select("id")
    .single();
  if (venueError) throw venueError;

  const { error: staffError } = await client
    .from("venue_staff")
    .insert({ user_id: userId, venue_id: venue.id });
  if (staffError) throw staffError;

  return { venue_id: venue.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/venue/provisioning.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the API route**

```typescript
// app/api/venue/signup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { provisionVenueForUser } from "@/lib/venue/provisioning";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { venue_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.venue_name !== "string" || !body.venue_name.trim()) {
    return NextResponse.json({ error: "Venue name is required." }, { status: 400 });
  }

  try {
    const result = await provisionVenueForUser(user.id, body.venue_name.trim());
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create venue." }, { status: 400 });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/venue/provisioning.ts app/api/venue/signup/route.ts tests/lib/venue/provisioning.test.ts
git commit -m "Add idempotent venue provisioning for self-serve signup"
```

---

## Task 4: Signup page

**Files:**
- Create: `components/auth/SignupForm.tsx`
- Create: `app/signup/page.tsx`
- Test: `tests/components/auth/SignupForm.test.tsx`

**Interfaces:**
- Consumes: `AuthScreen` (`components/auth/AuthScreen.tsx`, already built — eyebrow/tagline/title/children props), `createBrowserSupabaseClient` (`lib/supabase/client.ts`), `POST /api/venue/signup` from Task 3.
- Produces: `SignupForm` component, rendered by `app/signup/page.tsx` — no other task depends on its internals.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/components/auth/SignupForm.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignupForm } from "@/components/auth/SignupForm";

const mockSignUp = vi.fn();
const mockPush = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { signUp: mockSignUp },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  mockSignUp.mockReset();
  mockPush.mockReset();
});

describe("SignupForm", () => {
  it("signs up, provisions the venue, and redirects to /welcome", async () => {
    mockSignUp.mockResolvedValue({ error: null });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ venue_id: "v1" }) });

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/venue name/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({ email: "owner@example.com", password: "strong-password-123" })
    );
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/venue/signup",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ venue_name: "Демо Локал" }) })
      )
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/welcome"));
  });

  it("shows the Supabase error inline when signUp fails, without calling the provisioning route", async () => {
    mockSignUp.mockResolvedValue({ error: { message: "User already registered" } });
    global.fetch = vi.fn();

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/venue name/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText("User already registered")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("retries provisioning once automatically before showing an error", async () => {
    mockSignUp.mockResolvedValue({ error: null });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "transient failure" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ venue_id: "v1" }) });

    render(<SignupForm />);

    fireEvent.change(screen.getByLabelText(/venue name/i), { target: { value: "Демо Локал" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "strong-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/welcome"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/auth/SignupForm.test.tsx`
Expected: FAIL — `Cannot find module '@/components/auth/SignupForm'`.

- [ ] **Step 3: Write the implementation**

```typescript
// components/auth/SignupForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

async function provisionVenue(venueName: string): Promise<Response> {
  return fetch("/api/venue/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ venue_name: venueName }),
  });
}

export function SignupForm() {
  const router = useRouter();
  const [venueName, setVenueName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      let response = await provisionVenue(venueName);
      if (!response.ok) {
        // A transient failure right after signUp shouldn't strand a
        // freshly-created account — retry once before giving up.
        response = await provisionVenue(venueName);
      }
      if (!response.ok) {
        const { error: message } = await response.json();
        setError(message ?? "Something went wrong. Please try again.");
        return;
      }

      router.push("/welcome");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="auth-field">
        <label className="lab-s" htmlFor="signup-venue-name">
          Venue name
        </label>
        <input
          id="signup-venue-name"
          className="fld"
          placeholder="Venue name"
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          required
        />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="signup-email">
          Email
        </label>
        <input
          id="signup-email"
          className="fld"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="signup-password">
          Password
        </label>
        <input
          id="signup-password"
          className="fld"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
        {isSubmitting ? "Signing up..." : "Sign up"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/auth/SignupForm.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the page**

```typescript
// app/signup/page.tsx
import { AuthScreen } from "@/components/auth/AuthScreen";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <AuthScreen
      eyebrow="Започни бесплатно"
      tagline="Организирајте настани, резервации и гости — сè на едно место."
      title="Создади сметка"
    >
      <SignupForm />
    </AuthScreen>
  );
}
```

- [ ] **Step 6: Run the full test suite to make sure nothing regressed**

Run: `npx vitest run`
Expected: all tests pass, including the 3 new ones.

- [ ] **Step 7: Commit**

```bash
git add components/auth/SignupForm.tsx app/signup/page.tsx tests/components/auth/SignupForm.test.tsx
git commit -m "Add self-serve venue signup page"
```

---

## Task 5: Welcome screen

**Files:**
- Create: `app/welcome/page.tsx`

**Interfaces:**
- Consumes: `createServerSupabaseClient` (`lib/supabase/server.ts`), `getCurrentVenueId` (`lib/venue/current-venue.ts`) — same pattern every `/venue/*` page already uses to resolve the signed-in user's venue, reused here since this page needs the venue's name but must not live under `/venue/*` (see File Structure's note on why).
- Produces: nothing consumed by a later task — this is a leaf page.

**No test for this task.** It is a static server component with no client interaction, no conditional logic beyond "redirect if not signed in" (the exact same redirect every `/venue/*` page already performs, already covered by those pages' own behavior) — a render-only test would just assert static strings are present, which the plan's own no-placeholder code below already guarantees. Live verification (Task 6) covers it.

- [ ] **Step 1: Write the page**

```typescript
// app/welcome/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import "@/app/venue/panel.css";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  if (!venueId) {
    redirect("/login");
  }

  const { data: venue } = await supabase.from("venues").select("name").eq("id", venueId).single();

  return (
    <div className="vp" style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="panel" style={{ maxWidth: 480, width: "100%", padding: "36px 32px" }}>
        <h1 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 6px" }}>
          Добредојдовте во КАДЕ СУМ?, {venue?.name ?? "Локал"}!
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "0 0 22px" }}>
          Еве неколку чекори за да започнете:
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          <Link href="/venue/tables" className="ev" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            Додади простории
          </Link>
          <Link href="/venue/menus" className="ev" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            Додади мени
          </Link>
          <Link href="/venue/events/new" className="ev" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            Создади пробен настан
          </Link>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/venue" className="btn btn-gold">
            Продолжи кон контролната табла
          </Link>
          <Link href="/venue" className="btn btn-ghost">
            Прескокни
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/welcome/page.tsx
git commit -m "Add one-time welcome screen after venue signup"
```

---

## Task 6: Marketing homepage

**Files:**
- Modify: `app/page.tsx` (replace entirely, preserving `RecoveryRedirect`)
- Modify: `app/venue/panel.css` (append a new marketing-page section)
- Create: `components/marketing/ContactForm.tsx`
- Test: `tests/components/marketing/ContactForm.test.tsx`

**Interfaces:**
- Consumes: `RecoveryRedirect` (`components/RecoveryRedirect.tsx`, unchanged), `POST /api/venue/contact` from Task 2.
- Produces: nothing consumed by a later task — this is a leaf page.

- [ ] **Step 1: Write the failing test for the contact form**

```typescript
// tests/components/marketing/ContactForm.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContactForm } from "@/components/marketing/ContactForm";

describe("ContactForm", () => {
  it("submits name, email, and message to the contact API", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Ана Петровска" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Интересирани сме." } });
    fireEvent.click(screen.getByRole("button", { name: /send|испрати/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/venue/contact",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Ана Петровска", email: "ana@example.com", message: "Интересирани сме." }),
        })
      )
    );
    expect(await screen.findByText(/thank you|благодариме/i)).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Failed to send message." }) });
    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Ана" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Прашање." } });
    fireEvent.click(screen.getByRole("button", { name: /send|испрати/i }));

    expect(await screen.findByText("Failed to send message.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/marketing/ContactForm.test.tsx`
Expected: FAIL — `Cannot find module '@/components/marketing/ContactForm'`.

- [ ] **Step 3: Write the ContactForm implementation**

```typescript
// components/marketing/ContactForm.tsx
"use client";

import { useState } from "react";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/venue/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      if (!response.ok) {
        const { error: msg } = await response.json();
        setError(msg ?? "Failed to send message.");
        return;
      }
      setSent(true);
    } catch {
      setError("Failed to send message.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sent) {
    return <p className="contact-sent">Благодариме! Ќе Ве контактираме наскоро.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="contact-form">
      <div className="auth-field">
        <label className="lab-s" htmlFor="contact-name">Име</label>
        <input id="contact-name" className="fld" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="contact-email">Е-пошта</label>
        <input id="contact-email" className="fld" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="contact-message">Порака</label>
        <textarea id="contact-message" className="fld" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required />
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="submit" disabled={isSubmitting} className="btn btn-gold">
        {isSubmitting ? "Се испраќа..." : "Испрати"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/marketing/ContactForm.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Append marketing-page CSS to `app/venue/panel.css`**

```css
/* ---------- public marketing homepage (app/page.tsx) ---------- */
.vp .mkt-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 48px;
  border-bottom: 1px solid var(--side-line);
}
.vp .mkt-nav a {
  color: var(--side-text);
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 600;
  margin-left: 28px;
}
.vp .mkt-nav a:hover {
  color: #fff;
}
.vp .mkt-hero {
  padding: 80px 48px;
  text-align: center;
  background: linear-gradient(160deg, var(--side), var(--side-2));
  color: #fff;
}
.vp .mkt-hero h1 {
  font-family: var(--font-display), var(--sans);
  font-size: 42px;
  margin: 16px 0;
}
.vp .mkt-hero p {
  color: var(--side-text);
  font-size: 16px;
  max-width: 560px;
  margin: 0 auto 28px;
}
.vp .mkt-hero-ctas {
  display: flex;
  gap: 14px;
  justify-content: center;
}
.vp .mkt-section {
  padding: 64px 48px;
  max-width: 1100px;
  margin: 0 auto;
}
.vp .mkt-section-title {
  font-size: 26px;
  font-weight: 800;
  text-align: center;
  margin: 0 0 40px;
}
.vp .mkt-feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
}
.vp .mkt-feature-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 24px;
  text-align: center;
}
.vp .mkt-pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}
.vp .mkt-pricing-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 28px;
}
.vp .mkt-pricing-card b {
  font-size: 18px;
}
.vp .mkt-pricing-card .price {
  font-family: var(--data);
  font-size: 22px;
  font-weight: 700;
  color: var(--gold-lo);
  margin: 8px 0 16px;
}
.vp .mkt-pricing-card ul {
  list-style: none;
  padding: 0;
  margin: 0 0 20px;
  color: var(--ink-2);
  font-size: 13.5px;
  line-height: 1.9;
}
.vp .contact-form {
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.vp .contact-sent {
  text-align: center;
  color: var(--ok);
  font-weight: 700;
}
.vp .mkt-footer {
  padding: 32px 48px;
  text-align: center;
  color: var(--muted);
  font-size: 12.5px;
  border-top: 1px solid var(--line);
}
```

- [ ] **Step 6: Update `app/venue/panel.css`'s header comment**

Find the header comment block at the top of the file (the one listing which layouts/pages import it) and add the marketing homepage to the list, matching its existing style of staying accurate as new surfaces adopt it.

- [ ] **Step 7: Write the marketing homepage**

```typescript
// app/page.tsx
import Link from "next/link";
import { RecoveryRedirect } from "@/components/RecoveryRedirect";
import { ContactForm } from "@/components/marketing/ContactForm";
import "@/app/venue/panel.css";

const FEATURES = [
  { title: "Организирај", desc: "Свадби, родендени, матурски, конференции и повеќе." },
  { title: "Резервирај", desc: "Простор, маси и термини лесно и брзо." },
  { title: "Гости и покани", desc: "Поканете гости, следете потврди и споделете спомени." },
  { title: "Менија & Пакети", desc: "Изградете менија и пакети за секој настан." },
];

const STEPS = [
  "Создадете бесплатна сметка за Вашиот локал",
  "Поставете ги Вашите простории, маси и менија",
  "Управувајте со настани и резервации на едно место",
  "Поканете ги паровите да ја користат нивната своја контролна табла",
];

const PRICING = [
  {
    name: "Основен",
    price: "1.500 ден/месечно",
    features: ["1 локал", "До 2 простории", "Управување со настани", "Резервации", "Распоред на маси"],
  },
  {
    name: "Про",
    price: "3.500 ден/месечно",
    features: [
      "Сè од Основен",
      "Менија и пакети",
      "Буџет и чеклиста за парови",
      "Дигитални покани со QR код",
      "Известувања (наскоро)",
    ],
  },
  {
    name: "Премиум",
    price: "По договор",
    features: ["Сè од Про", "Брендирање по мерка на локалот", "Извештаи и аналитика", "Приоритетна поддршка"],
  },
];

export default function Home() {
  return (
    <div className="vp">
      <RecoveryRedirect />

      <nav className="mkt-nav">
        <b style={{ color: "#fff" }}>КАДЕ СУМ?</b>
        <div>
          <a href="#home">Почетна</a>
          <a href="#platform">За платформата</a>
          <a href="#how">Како работи</a>
          <a href="#pricing">Планови</a>
          <a href="#contact">Контакт</a>
          <Link href="/login" style={{ color: "#fff", marginLeft: 28, textDecoration: "none", fontWeight: 600, fontSize: "13.5px" }}>
            Најави се
          </Link>
        </div>
      </nav>

      <header id="home" className="mkt-hero">
        <p style={{ letterSpacing: "0.2em", fontSize: 12, textTransform: "uppercase", color: "var(--gold-hi)" }}>where @re you?</p>
        <h1>КАДЕ СУМ?</h1>
        <p>Платформа за организирање на вашите посебни моменти — настани, резервации, гости, менија и повеќе, сè на едно место.</p>
        <div className="mkt-hero-ctas">
          <Link href="/signup" className="btn btn-gold">Започни бесплатно</Link>
          <Link href="/login" className="btn btn-ghost" style={{ background: "transparent", borderColor: "#fff", color: "#fff" }}>
            Најави се
          </Link>
        </div>
      </header>

      <section id="platform" className="mkt-section">
        <h2 className="mkt-section-title">За платформата</h2>
        <div className="mkt-feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="mkt-feature-card">
              <b>{f.title}</b>
              <p style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 8 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mkt-section">
        <h2 className="mkt-section-title">Како работи</h2>
        <div className="mkt-feature-grid">
          {STEPS.map((step, i) => (
            <div key={step} className="mkt-feature-card">
              <div style={{ color: "var(--gold-lo)", fontWeight: 800, fontSize: 22 }}>{i + 1}</div>
              <p style={{ fontSize: 13.5, marginTop: 8 }}>{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mkt-section">
        <h2 className="mkt-section-title">Планови</h2>
        <div className="mkt-pricing-grid">
          {PRICING.map((tier) => (
            <div key={tier.name} className="mkt-pricing-card">
              <b>{tier.name}</b>
              <div className="price">{tier.price}</div>
              <ul>
                {tier.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <a href="#contact" className="btn btn-ghost">Контактирајте нè</a>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="mkt-section">
        <h2 className="mkt-section-title">Контакт</h2>
        <ContactForm />
      </section>

      <footer className="mkt-footer">© 2026 Каде сум? Сите права задржани.</footer>
    </div>
  );
}
```

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the 2 new `ContactForm` tests.

- [ ] **Step 9: Commit**

```bash
git add app/page.tsx components/marketing/ContactForm.tsx app/venue/panel.css tests/components/marketing/ContactForm.test.tsx
git commit -m "Add public marketing homepage"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run `npx tsc --noEmit`**

Expected: no errors.

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (existing suite + this plan's new tests).

- [ ] **Step 3: Run `npm run build`**

Expected: build succeeds. (Stop any running `next dev` process first — this project's dev server and `next build` conflict over the shared `.next` directory.)

- [ ] **Step 4: Live verification**

Start the dev server, then walk through:
1. Visit `/` — confirm the hero, feature strip, how-it-works, pricing, and contact sections all render; submit the contact form and confirm the "Благодариме!" success state.
2. Click "Започни бесплатно" → fill in a brand-new venue name/email/password on `/signup` → submit.
3. Confirm redirect to `/welcome`, showing the venue's name and the 3-item checklist with no sidebar chrome.
4. Click "Продолжи кон контролната табла" → confirm landing on `/venue` with an empty dashboard (0 events, 0 rooms), fully clickable like any other venue.
5. Clean up: delete the test venue and its auth user via a throwaway script, per this project's established verification-cleanup convention.

- [ ] **Step 5: Commit any fixes found during verification**

If live verification surfaces a bug, fix it, re-run the affected tests, and commit the fix separately with a clear message.
