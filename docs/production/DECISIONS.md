# Decisions log (production readiness, Sep 2026)

Decisions taken while working through `production-tasks/`, so nobody has to rediscover why. "Owner" items are open and need an answer from the product owner.

## Taken

| Area | Decision | Why | Task |
|---|---|---|---|
| Runtime | Node 22, pinned (`.nvmrc`, `engines`, `engine-strict`) | supabase-js needs native WebSocket (Node ≥ 22); Vercel supports it | INFRA-004 |
| Framework | Next.js 16.3 + React 19; `middleware.ts` → `proxy.ts` (Node runtime) | Only 16.x fixes the critical/high advisories | SEC-024 |
| Lint | ESLint 9 flat config; `react-hooks/set-state-in-effect` off | 14 existing effects would need behaviour-changing rewrites; separate change | SEC-024 |
| Rate limiting store | Postgres table + atomic function, not Upstash | No extra processor, EU data stays in one place, same-region latency | SEC-002 |
| Rate limits | login 10/min/IP, signup 5/h/IP, contact 5/h/IP (fail closed); RSVP 20/h/IP/slug, photo 20/h/event (fail open) | Spec budgets; credential/email/account routes must not run unlimited | SEC-002 |
| CSP | Enforced. `script-src 'unsafe-inline'` (Next inline bootstrap, no nonce proxy), `style-src 'unsafe-inline'` (inline style attributes) | Zero violations on every page (e2e/csp-pages.spec.ts); a nonce would force dynamic rendering everywhere | SEC-001 |
| Privileges | Explicit grants; new tables/functions closed to API roles by default | Supabase Cloud and local CLI start from different defaults; drift check needs them equal | SEC-023, SEC-006 |
| SEC-019 | Explicit `WITH CHECK` added, but the issue was not exploitable | Postgres reuses `USING` as `WITH CHECK` for UPDATE policies without one; kept explicit + regression test | SEC-019 |
| Couple sessions | SHA-256 at rest; no fallback lookup by raw token | A fallback would let a leaked hash be replayed; cost: sessions created in the minutes between migration 0032 and the app deploy must log in again | SEC-008 |
| Couple passwords | Minimum 10 characters in the database; generator makes 12 | Hand-typed passwords like `1234` were accepted | SEC-027 |
| Password regenerate | Ends all couple sessions of that event | The reset exists for leaked credentials | SEC-009 |
| Floor-plan lock | New venues start with no code (set in Settings); existing ones keep theirs | No shared `0000`; least UI change. **The seed/demo venue "Kade Sum" created on 28 Sep still has `0000` — set a code in Settings.** | SEC-010 |
| Double booking | Exclusion constraint on real time ranges (overnight-aware, 3 h default); cancelled/completed don't hold a table | Subset of the app's stricter check, so it never refuses what the UI allows | DATA-012 |
| Public RSVP overwrite | Guests may still change their own answer via the link; every change is recorded (audit) and the couple sees "Одговор преку поканата: <time> (претходно: …)" | Guests genuinely change their minds; blocking would push them to message the couple; visibility closes the silent-sabotage hole | SEC-021 |
| Login enumeration | One message for wrong password, unknown user and locked account | Lockout message confirmed usernames | SEC-022 |
| Placeholder pages | Stay visible and marked "Наскоро"; Support became a real contact page | Matches the approved design; no dead ends | ARCH-003 |
| Invitation photos | Browser → Storage via signed upload; bucket allow-list JPEG/PNG/WebP/GIF/AVIF, 50 MB; magic-byte check before attaching; SVG refused | Vercel's 4.5 MB body limit; public bucket | SEC-005, SEC-028 |
| File cleanup | DB triggers queue deleted/replaced photos; hourly Vercel cron drains; unconfirmed uploads swept after 24 h | Deletes happen from the browser and by cascade; SQL can't delete Storage objects | DATA-011 |
| Multi-step writes | Six operations moved into transactional Postgres functions | Partial writes on failure | REL-005 |
| Errors to users | Only messages our code throws on purpose; everything else → the route's fallback, original logged with request id | Postgres/PostgREST text leaked schema details | SEC-003 |
| Logging | JSON lines, one per API request, request ids from the proxy; PII keys redacted | Queryable logs without personal data | OBS-002 |
| Error tracking | Sentry, off until `NEXT_PUBLIC_SENTRY_DSN` is set; scrubbed events; no tunnel (Turbopack) — CSP allows the ingest host when enabled | | OBS-001 |
| Account deletion | Full deletion (venue, its data, staff users, files) | Default until the owner decides otherwise (see open items) | DATA-005 |
| Event erasure | Keeps the event row (date, type, status, finance) but no personal data | Calendar/reports stay intact | DATA-005 |
| Bot protection | Not now; revisit if rate limits prove insufficient after launch | Spec makes it conditional; avoids a third-party widget and CSP change | SEC-013 |
| Product analytics | Not now | Needs consent design and a tool choice; no need before launch | OBS-007 |
| Maintenance mode | Env flag + team bypass cookie | Rarely needed; expand/contract avoids downtime | REL-007 |
| Personal invite links | `/invite/<slug>?g=<token>`; token 24 chars, one per guest, never exported, stripped from Sentry by the query-string scrub; wrong/other-event token shows the shared invitation, RSVP with it is refused | Guests answer without typing a name; the shared link keeps working | A1 (S2) |
| RSVP answers | Statuses yes / no / later; menu, allergies and children only with a yes; "later" or "no" keeps the couple's numbers; old `attending` body still accepted | Guests change their minds; a page opened before the deploy must not break | A2–A5 (S2) |
| Language | RSVP, "Каде седам?" and all staff/couple auth messages in Macedonian (Supabase Auth errors mapped by code; unknown ones get a generic line) | Resolves open item 9 | A18 (S2) |
| Sending invitations | WhatsApp/Viber/SMS/mailto links, or email through Resend when configured; a guest is marked sent when the couple clicks (the app cannot see delivery); Viber has no "to number with text" link, so the couple picks the chat | Works on any phone without app integrations | A9 (S2) |
| Co-organizers | One extra login per side; sees every guest, sends only for their side (enforced server-side); managed by the couple's own login only; username space shared with couple logins | Two families send their own invitations | A12 (S2) |
| Couple contacts at event creation | Email + phone required in the venue's forms and in `lib/venue/events`; **no DB constraint** | A NOT VALID check still fires on every update of old events and on erasure (0043 nulls them) | A21 (S2) |
| Client-side validation | No zod in browser bundles of panel forms | zod 4's JIT probe (`new Function`) is a CSP `unsafe-eval` violation | A21 (S2) |
| Reminders | One per event, default 15 days before at 10:00 Skopje, couple can move/switch off; hourly cron; claim per event + stamp per guest so nobody gets it twice; nothing sent (and nothing claimed) until email is configured | Idempotent under retries and overlapping cron runs | A10 (S2) |
| Changed answers | Couple is emailed when a guest changes an earlier answer (not for a first answer); best effort | The list already marks the change; email is the nudge | A11 (S2) |
| Public programme | The invitation shows agenda (time + title, never notes), locations and menu; map links only http(s), else a Maps search | Guests need them; couple-typed links are untrusted on a public page | A14 (S2) |
| Premium templates | Elegant gold, Rustic, Royal green marked premium; all usable until the `invitation_all_templates` entitlement exists | At most three per the brief | A13 (S2) |
| "Каде седам?" | Only an exact, unique name match returns a table; unknown name and unseated guest get the same answer; 30 lookups/h/IP/invitation | The guest list must not be probeable | A16 (S2) |
| Guest page | One scrolling page with a sticky section menu instead of tabs; table shown as text, **room mini-map deferred** until Session 3's read-only plan renderer exists | Tabs would duplicate sections; the brief allows "number only" | A15 (S2) |
| Countdown | Timer counts days; "УТРЕ е денот!" / "ДЕНЕС е денот!" by the Skopje calendar | A separate "Уште N дена" disagreed with the timer by a day | A19 (S2) |

## Open — owner decisions

1. **Plans**: approve Supabase Pro and Vercel Pro (HOSTING.md).
2. **Retention periods** (RETENTION.md): guest data 12 months after the event? contact messages 24 months? Then schedule the purge (exact SQL in RETENTION.md). The privacy policy must state the same numbers.
3. **Account deletion**: keep anything (e.g. anonymised finance history)? Currently everything is deleted.
4. **Staging**: create the staging Supabase project (ENVIRONMENTS.md) so previews and local dev stop sharing production.
5. **MFA**: opt-in now; make it mandatory for staff later?
6. **Legal**: fill company details in the privacy policy/terms/DPA placeholders; consider a human lawyer's check (LEGAL-REVIEW.md).
7. **Domain, Resend, Sentry, R2, uptime monitor**: accounts to create (SETUP.md).
8. **On-call**: names and contacts in INCIDENTS.md.
9. ~~**RSVP form language**~~: done (Session 2, A18), see "Language" above.
10. **Accessibility fixes** (A11Y.md): unlabeled inputs, muted-colour contrast, `<html lang="en">` → `mk` — approve the markup/colour changes.
