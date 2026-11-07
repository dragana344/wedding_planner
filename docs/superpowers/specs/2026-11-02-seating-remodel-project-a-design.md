# Seating remodel — Project A: presets and full-event seating

Status: agreed · 2026-11-02
Supersedes: the seating half (Part 2) of the 2026-10-31 change-marks design —
its draft/send/confirm idea for seating is replaced by this spec's §5.
Followed by: Project B (mini-events + the shared table-capacity pool across
reservations/mini-events/full events) and Project C (print/PDF, QR for the
couple, the logo watermark, wide-room zoom-to-fit) — both separate specs,
built after this one, since they depend on it.

## 0. Why this exists

Today a venue has exactly one "standard" layout per room, and one confirmed
layout per event copied from it. The couple has a private draft they can
edit freely, but there's no way for the venue to send *their* version back,
no record of what was agreed, and no way to turn the couple's editing off
for a venue that wants full control. This project builds that: multiple
reusable room layouts, a real baseline per event, and a two-way
send/approve/reject/counter flow between venue and couple.

## 1. Event creation: Mini event vs Full capacity event

Every event picks one of two **seating modes** at creation, before anything
else — stored as `events.seating_mode` (`'full'` or `'mini'`, not null, no
default, chosen explicitly in the creation wizard). Every other part of
event creation (guest list, menu, invitations, dashboard access) is
identical for both. Only the seating behavior differs:

- **`full`** — the event claims the entire room. This spec (§3–§8).
- **`mini`** — the event claims part of a room's capacity, shares it with
  other mini-events or ordinary reservations. Built in **Project B**; out
  of scope here except for reserving the column and the creation-wizard
  choice.

An event created today (before this ships) is backfilled as `'full'` — matches
how every current event already behaves (whole-room, no capacity sharing).
`seating_mode` is set once at creation and is not editable afterward — a
miscategorized event is deleted and recreated, same as any other structural
mistake today.

**Implementation note (2026-11-02):** the column keeps a DB-level default of
`'full'`, even though the creation wizard forces an explicit choice at the
UI layer — the database can't require it with no default, because hundreds
of existing direct `events` inserts elsewhere in this codebase and its test
suite don't go through `create_event_full` at all, and a NOT NULL column
with no default broke every one of them.

## 2. Room presets

A room can have one or more **named, saved layouts** ("presets") instead of
today's single standard layout.

- New table `room_layout_presets`: `id, room_id, name, snapshot jsonb,
  created_at, updated_at`. `snapshot` is the same `LayoutSnapshot` shape
  `lib/seating/history.ts` already uses (`{ elements, seats }` — here
  `seats` is unused/empty, since presets hold no guests), covering both
  `room_fixed_elements` and `room_layout_elements`.
- `name` unique per room (case-insensitive, trimmed — same convention as
  `venue_managers.name`).
- The floor-plan editor (`RoomFloorPlanPage`/`FloorPlanCanvas`) gets two new
  actions: **"Save as preset"** (snapshot the room's current fixed +
  movable elements into a new or existing preset row) and **"Load preset"**
  (overwrite the room's current fixed/movable elements from a preset's
  snapshot, pushing the prior state onto the existing undo stack first, so
  loading a preset is itself undoable).
- No limit on how many presets a room can have; "one or two" was the
  client's typical case, not a hard cap.
- Same password lock as today (`layout_lock_password_hash`) gates all of
  this — saving/loading a preset is an edit to the room, same gate as
  dragging a table.

## 3. The event's baseline

When a `full` event is created, the venue picks a starting preset (or the
room's current live layout, if they skip that step); whatever the layout
looks like when creation finishes is captured once as that event's
**baseline** — a new jsonb column `events.seating_baseline`, same
`LayoutSnapshot` shape, written once at creation and never auto-updated
afterward.

- The couple's draft (`events.seating_draft`, already exists) continues to
  work exactly as today — free editing, with its own undo stack
  (`seating_draft_undo`, already exists).
- New action, couple side: **"Reset to baseline"** — copies
  `seating_baseline` into `seating_draft` (pushing the draft's prior state
  onto `seating_draft_undo` first, so it's undoable like any other draft
  edit). This does not touch `event_layout_elements` (the live/confirmed
  layout) — only the draft.
- The venue's own working copy for a `full` event is `event_layout_elements`
  itself (already exists) — the venue is always editing "the live layout,"
  the couple is always editing "their draft." §5 is what moves a draft into
  the live layout, or the live layout into a draft for the couple to see.

## 4. Self-editing toggle

The couple's ability to touch their own draft can be switched off, two
levels, owner wins:

- **Venue-wide**, owner-only: `venues.couple_seating_self_edit_enabled
  boolean not null default true`. Set from Поставки, same owner-elevation
  gate as every other setting there (§ pattern already established this
  session for venue settings).
- **Per-event override**: `events.seating_self_edit_enabled boolean` —
  `null` (default) means "follow the venue-wide setting"; `true`/`false`
  explicitly overrides it for that one event. Editable by any elevated
  manager, same gate as other event fields.
- **Effective rule**: self-editing is enabled only if
  `venues.couple_seating_self_edit_enabled = true` **and**
  (`events.seating_self_edit_enabled` is `null` or `true`). The venue-wide
  switch being `false` always wins, regardless of the per-event value.
- This toggle only affects `full` events. It has no effect on mini-events or
  reservations — those are always staff-assisted by design (Project B),
  never self-service, so there is nothing to toggle there.
- **When disabled** (for a given event, by either level): the couple's
  seating page shows the current *live* layout (`event_layout_elements`),
  read-only — no drag/resize/rotate, no draft, no reset-to-baseline button —
  plus a fixed note: "За промени, контактирајте го локалот." ("To make
  changes, contact the venue.") The section is never hidden; the couple can
  always see the current plan.

## 5. Send / approve / reject / counter-propose

This section applies only to `full` events — a mini-event never has a
couple-side draft to send in the first place (§1, Project B).

Venue-side send/approve/reject requires **manager elevation**, same gate as
the other couple-facing commit actions already built this session (event
edits, menu numbers) — plain staff can still freely rearrange the live
layout day-to-day as they do today; only the act of sending it to the
couple, or approving/rejecting what the couple sent, needs an elevated
manager. The couple side has no equivalent gate (any organizer/co-organizer
can send, approve, or reject, same as every other couple action).

New table `event_seating_proposals`: `id, event_id, room_id, proposed_by
('venue'|'couple'), snapshot jsonb (LayoutSnapshot), status
('pending'|'approved'|'rejected'|'superseded'), note text, created_by text
(manager name, or null for the couple), created_at, responded_at,
responded_by text (manager name, or null for the couple)`.

- **Sending**: either side can send their current working copy at any time
  — the couple sends their draft (`seating_draft`), the venue sends the
  live layout (`event_layout_elements`, after editing it) — which inserts a
  new row with `status = 'pending'`. No locking: the sender can keep
  editing and send again, producing another independent `pending` row.
  Every send writes a notification for the other side (reusing the
  existing Известувања/couple-notifications system — new action
  `seating_sent`, carrying `proposed_by` so the title reads "Нов распоред
  од салата" or "Нов распоред од парот").
- **Approving**: the receiving side approves a specific pending proposal.
  This copies that proposal's `snapshot` into `event_layout_elements` (the
  live/confirmed layout) — approving a couple's proposal updates the live
  layout the venue sees; approving a venue's proposal is how the venue's
  in-person edits become final. The proposal's `status` becomes
  `'approved'`. **Every other still-pending proposal for the same
  event+room, from either side, is automatically marked `'superseded'`**
  (the layout has moved on; an old pending proposal is no longer
  actionable). A notification goes to the side that sent it.
- **Rejecting**: sets `status = 'rejected'`, with an optional `note` (free
  text — the rejection reason). A notification goes to the sender,
  including the note when present.
- **Counter-proposing**: not a separate action — the rejecting side can
  simply edit their own working copy and send it, which is an ordinary new
  `pending` row from them. The UI frames this as "reject and send your own
  version" when both happen together, but structurally it's just a reject
  followed by a send.
- A pending proposal is visible to the receiving side as a distinct,
  clearly-dated entry (not merged into "the draft" or "the live layout") —
  the receiving side reviews it before approving, the same way an email
  attachment is reviewed before being accepted, not auto-applied.

## 6. Guest-count ↔ seating mismatch flag

Purely computed, no new storage: whenever `events.guest_count_estimate`
exceeds the total seat capacity of the current live layout
(`event_layout_elements`, summed via each element's `table_types.seats`),
the venue's seating screen shows a flag: "Бројот на гости (N) го надминува
капацитетот на тековниот распоред (M)." This reuses the guest-count-change
notification already built this session (§S4 of the 2026-10-31 change-marks
design) — no new tracked "change," just a live check surfaced specifically
on the seating screen, recomputed on every render.

## 7. Removing `seating_unseen_at`

`events.seating_unseen_at` (0090) is dropped. Its only two non-test call
sites (`lib/venue/events.ts`, `lib/couple/seating.ts`) are removed — the job
it did (tell the venue something changed in seating) is now done properly
by §5's notifications, which carry who sent what and when, instead of a
single boolean dot.

## 8. Data model summary (new/changed only)

- `events.seating_mode` (`'full'|'mini'`, not null) — new.
- `events.seating_baseline` (jsonb) — new.
- `events.seating_self_edit_enabled` (boolean, nullable) — new.
- `venues.couple_seating_self_edit_enabled` (boolean, not null, default
  true) — new.
- `room_layout_presets` (id, room_id, name, snapshot, created_at,
  updated_at) — new table.
- `event_seating_proposals` (id, event_id, room_id, proposed_by, snapshot,
  status, note, created_by, created_at, responded_at, responded_by) — new
  table.
- `events.seating_unseen_at` — dropped.
- `events.seating_draft`, `seating_draft_undo`, `event_layout_elements`,
  `event_rooms`, `room_fixed_elements`, `room_layout_elements`,
  `event_seat_assignments` — unchanged, still the live/draft layout
  mechanics underneath everything above.

## 9. Out of scope here (later projects)

- Mini-events, the shared table-capacity pool across reservations/
  mini-events/full-events, the informational full-event flag on
  Reservations, and the "organizer requests tables, venue assigns them"
  flow — **Project B**.
- The redesigned PDF/export (with per-seat menu/allergy info), the couple
  downloading their own QR table-cards, the logo watermark on every seating
  view, and the wide-room zoom-to-fit — **Project C**.
- Any automatic time-based table-availability logic — explicitly rejected
  this session for the whole seating system, not just this project.
