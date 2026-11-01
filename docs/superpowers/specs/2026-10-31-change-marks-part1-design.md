# Change marks between venue and couple — Part 1 (no seating)

Status: agreed · 2026-10-31
Follows: event menus and guests' menu choices (2026-10-30), which shipped a
first, numbers-only "Нови бројки" + Видено. This feature absorbs it.
Part 2 (seating drafts, send/confirm, seating comparison) is a separate spec.

## 1. Goal

When one side changes something the other side relies on, the other side
sees exactly what changed (old → new) until they press **Видено**. The couple
also gets every guest reply; the venue gets only the final menu numbers, on a
fixed timeline that ends with an automatic send.

## 2. What is shared, and who gets a mark

| # | Section | Changed by | Mark for |
|---|---|---|---|
| S1 | Датум и време (date, start, end) | venue manager | couple |
| S2 | Простории (halls) | venue manager | couple |
| S3 | Мени (menus on the event; the custom menu's name and dishes) | venue manager | couple |
| S4 | Број на гости (guest count estimate) | couple, or the venue on the couple's behalf | the other side |
| S5 | Контакт (email, second email, phone) | either side | the other side |
| S6 | Финансии (total price, deposit) | venue manager | couple — shown only in Буџет |
| S7 | Бројки за мени (final per-menu numbers) | couple, or sent automatically | venue |

No mark: event name, event type, status, couple password reset, plan
features, venue name and branding, promotion photos, and everything only the
couple sees (own budget items, checklist, agenda, locations, notes,
invitation, album, greetings, co-organizers).

The venue can fill in everything a couple who never uses the app would
(guest count, contact, numbers — see §7.4).

## 3. Rules (all sections)

- **Your own changes never mark you.** A change made by the venue marks the
  couple, and the other way round.
- **Old → new, every change**, even one later undone (120 → 150 → 120 shows
  both steps). Each change shows when it happened.
- **Видено clears the whole section** for that side; the history is kept.
  The screen goes back to normal, showing the current values.
- **Venue:** every staff member sees marks; only a **manager** can press
  Видено. **Couple:** any organizer or co-organizer presses it for everyone.
- **Privacy:** contact and finance values (S5, S6) are manager-only on the
  venue side since migration 0117. Staff without manager login see that
  Контакт/Финансии changed, never the values.
- **No new marks after the event date** (venue local date). Open marks on a
  past event stop counting.
- **In-app only.** No emails for marks or reminders (maybe later).
- Marks start the day this ships; there is no earlier history.
- **Couple marks start at the couple's first login.** Changes the venue makes
  before any organizer has ever logged in are the starting state, not
  changes (e.g. a time fixed right after creating the event). The first
  login of the main couple account or any co-organizer is recorded.
- **Personal-data erasure is never a change**: it creates no mark, and it
  clears the contact values already held in the change history.

## 4. Venue screens

- **Настани in the side menu:** a count of events with an open mark.
- **Event list, calendar, dashboard:** a "!" on each event with an open mark.
- **Event window:** each section with an open mark (the Мени block, Простории,
  Датум и време, Број на гости, Контакт на парот, Бројки за мени) gets a strong
  border, a **"Променето"** label, the list of changes and **Видено**.
  The existing "Нови бројки" / Видено for menu numbers becomes S7 here
  (same look; same 409 when newer numbers arrive meanwhile).
- **Известувања** (see §6).

## 5. Couple screens

- **Side menu dots:** Мени (S3), Гости (new guest replies, §7.1), Буџет (S6).
- **Почетна:** a box per changed section S1, S2, S4, S5 with the changes
  and Видено.
- **Мени page:** box at the top with the S3 changes and Видено.
- **Буџет page:** box with the S6 changes and Видено (not on Почетна).
- **Известувања** — new couple page (see §6).

## 6. Известувања (both sides)

Two kinds of item:

1. **Needs Видено** — a change from the other side. Shows **"Не е видено"**
   until accepted. Pressing Видено here or in the section clears both (same
   mark). Venue: everyone sees the sign, only managers accept.
2. **Information** — no sign, nothing to accept.

Colour legend at the top, also usable as a filter:

| Colour | Venue | Couple |
|---|---|---|
| Yellow | Промени од парот (S4, S5) — needs Видено | Промени од салата (S1–S6) — needs Видено |
| Green | Бројки за мени (S7) — needs Видено | Одговори од гости |
| Blue | Настани (created, deleted) | Потсетници (§7.2) |
| Grey | Пристап (couple login, password) | — |
| Red | Приватност (data erased or exported) | — |

The venue's Известувања **no longer lists guest replies** (today's
"Одговор на поканата" items are removed).

## 7. Guest replies and the final-numbers timeline

### 7.1 Guest replies (couple)

- Every RSVP answer shows on the guest's row as now. Answers that arrived
  since the couple last cleared them carry a **"Ново"** badge; the list can
  filter "само нови". A dot on Гости in the side menu.
- Each answer is also an item in the couple's Известувања.
- One button clears all "Ново" badges (**Означи ги како видени**).

### 7.2 Timeline (days before the event, venue local date)

| When | What happens |
|---|---|
| 25 days | Couple: reminder "Испратете ги конечните бројки до салата" (banner on Гости + Известувања item). |
| 20 → 15 days | Venue, if not yet sent: warning **"Бројките уште не се испратени"** on the event, with **"Потсети го парот"** (manager, at most once a day; shows the couple's phone and when it was last pressed; adds a reminder for the couple in the app). |
| 15 days | If still not sent: the current numbers are **sent automatically**. |

- **Auto-send** counts what a manual send counts (confirmed guests and their
  menu choices; declined don't count). The venue sees it as
  **"Испратено автоматски — непотполно"** plus how many guests have no
  answer yet. It is an S7 change like any other (Видено).
- The couple can still send afterwards; it works as a normal resend.
- **Late events:** steps already past when the event is created are skipped,
  and an event created within 15 days of its date gets **no auto-send** — the
  venue just sees the warning.
- Runs from the existing daily cron. Days are fixed for now (25/20/15).

### 7.3 Expected guest count

The venue keeps seeing the expected count (S4) from creation onwards; the
final numbers (S7) replace it as the planning number once sent.

### 7.4 Venue fills in for the couple (agreed 2026-10-31)

A manager can enter the final per-menu numbers themselves (e.g. after a
phone call). Shown as **"Внесено од салата"**; it counts as sent (stops the
timeline) and is a change the couple sees (yellow).

## 8. How it works (technical)

- **`event_changes`**: event, section (S1–S6), side (`venue` | `couple` |
  `system`), field, old value, new value, changed at, changed by (manager or
  organizer name when known).
- **`event_change_seen`**: event, viewing side, section, seen up to, seen by.
- A section is marked for side V when it has a change from the other side
  newer than V's "seen up to" and the event is not past.
- **Recording:** database triggers on `events` (S1, S4, S5, S6 columns),
  `event_rooms`, `event_menu_templates` and the custom menu's dishes write
  every change, so no screen or route can skip it. The side defaults to
  `venue`; the couple's writes (guest count, contact) go through database
  functions that label the change `couple` in the same transaction.
- **S7** keeps its own table (`event_menu_submissions`, already has
  seen at / seen by); auto-sent and venue-entered submissions get a source
  (`couple` | `auto` | `venue`) and the unanswered count.
- **Guest replies:** from the existing RSVP log; the couple's "seen up to"
  for replies uses the same `event_change_seen` table (section `guest_replies`).
- **Reminders:** the daily cron records the 25-day reminder and the
  15-day auto-send once per event; "Потсети го парот" is recorded with time
  and manager (once a day).
- **Personal-data erasure** also clears the contact values held in
  `event_changes` (S5). Deleting an event deletes its changes.
- Reads: the couple through its existing server routes; the venue through
  manager-gated routes for S5/S6 values, staff routes for everything else.

## 9. Out of scope (Part 1)

Seating (Part 2), emails, venue-configurable day counts, the couple sharing
photos with the venue for promotion (future paid-plan feature).

## 10. Testing

- DB: each trigger records the right section/side/old/new; couple functions
  label `couple`; marks and Видено per side; past events stop counting;
  erasure clears S5 values; staff cannot read S5/S6 values.
- Unit: the mark rules, the timeline (25/20/15, late events, once-a-day
  reminder), Известувања grouping and colours.
- E2E: venue changes date and menu → couple sees the box and presses Видено;
  couple changes guest count → venue sees "!" and Видено; auto-send at
  15 days shows "Испратено автоматски — непотполно".
