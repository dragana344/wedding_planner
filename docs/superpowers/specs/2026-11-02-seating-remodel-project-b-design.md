# Seating remodel — Project B: mini-events and shared table capacity

Status: agreed · 2026-11-02
Builds on: Project A (room presets, event baseline, self-editing toggle,
send/approve/reject proposals, guest-count mismatch flag, the event-creation
Mini/Full choice — all shipped).
Followed by: Project C (print/PDF, QR for the couple, the logo watermark,
wide-room zoom-to-fit) — a separate spec, built after this one.

## 0. Why this exists

A mini-event (Iva's birthday, 10 tables, in the same room the venue runs
normally that day) is still a real event — the client gets the full
dashboard package (guests, menu, invitations, the lot) — but it must share
the room with everyday reservations and other mini-events on the same date,
instead of claiming the whole room the way a `full` event does. Today
`events.seating_mode` already distinguishes the two (Project A §1), but
picking `'mini'` does nothing yet: a mini-event gets no table claim, no
capacity check against what else is booked that day, and no staff screen to
assign it specific tables. This project builds that.

## 1. The core decision: a mini-event *is* a reservation with a dashboard attached

The venue already has a complete, battle-tested mechanism for "this room's
physical tables are claimed for this date/time": `reservations` +
`reservation_tables`, with a real DB-level exclusion constraint (migration
`0035`) that makes two bookings holding the same physical table at
overlapping times impossible, race conditions included. Rather than build a
second, parallel capacity system against `event_layout_elements` (the
per-event seating editor Project A built for `full` events), a mini-event's
table claim **is** a `reservations` row — the same table-picker, the same
conflict check, the same DB guarantee, now also linked to the event it
belongs to.

- New column: `reservations.event_id uuid references events(id) on delete
  cascade, null` — null for an ordinary reservation; set for the one
  reservation that is a mini-event's table claim. Deleting the event deletes
  its claim with it, freeing the tables immediately — the same thing
  deleting a reservation outright already does.
- A mini-event's `event_rooms` row still exists (one room, same as today —
  a mini-event does not span rooms) so every place that already reads
  "which room is this event in" keeps working unchanged.
- `full` events get no `reservations` row at all — they aren't sharing
  anything, there's nothing to claim against.
- A mini-event's `event_layout_elements`/draft/baseline/proposals
  (Project A §2–§6) **do not apply** — a mini-event never gets its own
  seating editor, draft, or send/approve/reject flow. Its "seating" is
  exactly the set of tables its linked reservation holds. This matches the
  spec's own framing already in Project A §1 ("out of scope here except for
  reserving the column") and the explicit decision that mini-events are
  never self-service ("these type of events... should not get the ability
  to rearrange themselves because it can become a problem if there are two
  or more in that day").

## 2. Creating a mini-event

The event-creation wizard's existing seating-mode step (Project A §1)
already asks Full vs Mini. When Mini is picked, the **Rooms/Menu step
changes**:

- Exactly **one** room, not several (a mini-event doesn't span rooms) —
  the room picker becomes single-select for this mode.
- A date/time (the wizard already collects a date in its own step; mini
  mode additionally requires a start time, reusing the same `start_time`
  field the event already has — no new field).
- A guest-count-only path at creation: the wizard's existing Guests step
  (step 4, already built) is reused as-is. No table is pre-selected.

On submit, `create_event_full` runs exactly as today, **plus**: if
`seating_mode = 'mini'`, it also inserts a `reservations` row for that one
room/date/time with `event_id` set to the new event, `party_size` from the
guest-count step, `guest_name` the event's own `couple_names`, and
`table_ids = []` (no tables yet — see §3). This keeps event creation one
atomic server-side call, same as `full` events today.

- **No specific-table selection inside the wizard.** The user's own words:
  table assignment "should not get the ability to rearrange themselves...
  only with the venue" — doing it inside the solo, no-staff-countercheck
  wizard flow would defeat that. Picking exact tables is §3's job, done
  right after, with the full picker and conflict display.

## 3. Assigning tables: staff-assisted, always

A new screen, **"Маси" tab on the event** (next to Распоред for a `full`
event — a `mini` event gets this tab instead of a seating editor), reusing
the exact table-picker already built for Резервации
(`FloorPlanCanvas` + `getTableAvailability` + `findConflictingTables`):

- Shows the room's floor plan for the event's date/time, colored exactly as
  Резервации does today (green free, red genuinely occupied right now — no
  advance-warning tier, per the fix in §7).
- Staff (any staff, not manager-gated — same as Резервации today) toggles
  tables on/off; saving calls the same `createReservation`/update path,
  writing `reservation_tables` for the mini-event's linked reservation.
  The DB exclusion constraint is the real backstop against a race with
  another booking, exactly as it already is for ordinary reservations.
- **Guest count can change after creation** (the user's own point: "the
  number cannot be static") — editing the event's guest count (the existing
  guest-count field, already editable) does not itself touch tables; staff
  comes back to this same tab and adds or removes tables to match, same
  motion as any other day. No automatic resizing — the venue decides.
- This tab is the *only* place a mini-event's tables are ever touched. The
  organizer's own dashboard shows the current table list **read-only** (no
  seating editor at all for `mini` — not even a view-only one; a short
  line, "Вашите маси: Маса 3, Маса 5, Маса 7", is enough) with the same
  "contact the venue" framing Project A §4 uses for a disabled `full` event.

## 4. Capacity: what "do we have room today" means

Purely computed, no new aggregate columns — a direct extension of what
`computeHourlyTableOccupancy` (`lib/venue/occupancy.ts`) already does,
which already operates on `Reservation.table_ids` and therefore **already
includes mini-events' claims for free** once §1 ships, with zero changes to
that function.

- Резервации's existing hour-by-hour occupancy slider for a room+day now
  shows mini-events' tables too, automatically (they're reservations).
- New: a plain count on the same page — "N од M маси зафатени денес" for
  the selected room/day — `M` is the room's total table count (sum of
  `table_types.quantity` for that room, the same ceiling §2 of this spec
  and Project A's baseline capture already treat as the room's size); `N`
  is the number of distinct tables any active reservation (plain or
  mini-event) holds that day, at the busiest hour (the max of
  `computeHourlyTableOccupancy`'s `reservedTables` across the 24 hours).
- **No blocking anywhere.** This is a number for staff to look at before
  deciding whether to take another booking, never an automatic refusal —
  consistent with the explicit, standing decision this session that
  automatic time- or capacity-based blocking has no place in this system.

## 5. The full-event flag on Резервации

When a room has a `full`-mode event on the selected date (an `event_rooms`
row joined to an `events` row with that `event_date` and `seating_mode =
'full'`), Резервации shows a plain, non-blocking banner for that room/day:
"Овој датум има настан со целосен капацитет во оваа сала." Staff can still
create a reservation or a mini-event there regardless — the banner is
information, not a gate, matching §4's "no blocking anywhere" and the
spec's standing rejection of automatic availability logic.

## 6. Reservations list: telling a mini-event apart from a plain booking

A reservation with `event_id` set shows a small tag ("Мини настан") next
to it in the day list and the floor-plan selection, and its row links to
the event (same place Известувања already link to events). Cancelling it
from the day-list follows the event, not the reservation in isolation: the
list's cancel action for such a row deletes the **event**
(`delete_event_as_manager`, already gated the same way every other event
deletion is), which cascades to the reservation per §1 — staff never ends
up with an orphaned mini-event stripped of its dashboard, or a dangling
table claim with no event behind it.

## 7. Carried-over fix: Резервации's advance-warning table coloring

Already fixed this session, noted here for the record since it was found
while surveying this exact area: `getTableAvailability`'s red/yellow
proximity tiers (marking a table unavailable up to an hour before a booking
even starts) contradicted the standing decision that no automatic
time-based blocking exists anywhere in this system. Collapsed to a single
"reserved" flag for tables genuinely occupied at the previewed instant,
nothing earlier.

## 8. Data model summary (new/changed only)

- `reservations.event_id` (uuid, nullable, `references events(id) on
  delete cascade`) — new.
- No new tables. No changes to `event_layout_elements`,
  `event_seating_proposals`, `events.seating_baseline`, or anything else
  Project A built — those stay `full`-only.

## 9. Out of scope here (later / never)

- Project C's print/PDF/QR/logo/zoom work — separate spec, after this one.
- Any automatic time-based or capacity-based blocking — rejected for the
  whole system this session, not just this project (restated here because
  §4/§5 are exactly the places someone might reach for it later).
- A mini-event's own seating editor, draft, baseline, or proposals — never;
  §3's staff-only table tab is the entire feature for mini-events.
