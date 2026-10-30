# Event menus and guests' menu choices — design

Date: 2026-10-30 · Status: agreed in conversation, awaiting written-spec review

## 1. Goal

Today an event has one menu (`events.menu_template_id`) that the couple can freely swap for any of the venue's packages, or replace with a dish list they build themselves. The guests' RSVP asks a fixed "Стандардно / Посно / Вегетаријанско" question that isn't connected to any real menu. The new-event wizard can already pick several menus, but only the first one is shown anywhere.

After this change:
- The menus are **agreed between the couple and the manager** when the event is created. An event has one or more of the venue's packages and, where the plan includes it, a **custom menu** the manager builds for that event.
- **Only a manager** can change an event's menus later, from the venue dashboard. The couple sees the result but can't change it.
- **Guests pick between the event's menus** in their RSVP: per person, by count.
- The couple **sends the final per-menu numbers to the venue** with one click once every guest has a final answer. If something changes afterwards, they send updated numbers, and the venue sees what changed.

## 2. Decisions

| # | Decision |
|---|---|
| M1 | An event's menus are the packages linked in `event_menu_templates` (0115). That table becomes the only source of truth; `events.menu_template_id` is removed. |
| M2 | Only an elevated manager edits an event's menus: in the new-event wizard (already multi-select) and in the event window (new multi-select). Plain staff see them read-only. |
| M3 | Couples can no longer pick packages or build their own menu from their page — that is now done together with the manager, on the venue side (M13). Removed from the couple's side: menu editing, custom dish lists, and the per-dish quantities screen. |
| M4 | The couple's **Мени** page is view-only: each of the event's menus with its title and dishes. |
| M5 | Guests see each menu by its **package title** for now. A guest-facing tag ("Посно", "Стандардно"…) is a later change (§10). |
| M6 | One menu on the event: the RSVP doesn't ask, and every attending person counts toward that menu. Two or more: the RSVP asks how many of the party want each menu. |
| M7 | A guest entry's menu counts must add up to the people coming from that entry (`party_size`, which already includes children). |
| M8 | A guest is **done** when they said they're not coming, or are coming and their counts add up. Only when every guest is done can the couple send the numbers. |
| M9 | The couple can set or fix any guest's answer and menu counts by hand in the guest list (e.g. grandparents who don't use the app, or marking a non-responder as not coming). |
| M10 | Sent numbers are a **snapshot**. Later guest edits don't change what the venue sees until the couple sends again; the couple is told that there are unsent changes. |
| M11 | The venue sees the latest sent numbers on the event. A new sending shows what changed since the previous one and stays highlighted until a manager presses **Видено**. Everyone at the venue sees it. |
| M12 | The reminder email (A10, 15 days before) asks attending guests to choose their menus. The RSVP refuses "coming" without complete menu counts when the event has 2+ menus. |
| M13 | **Custom menu stays a plan feature** (`custom_menu`, per event), built by the **manager**: an event-only dish list with its own title (default "Сопствено мени"). It behaves exactly like a package for everything else — shown to the couple, choosable in the RSVP, counted in the numbers — but can't be added to any other event. Allowed only when the event's plan includes `custom_menu` (checked server-side). |
| M14 | **Мени / Пакети has two sections:** "Стандардни пакети" (reusable, offered for any event — as today) and "Сопствени менија за настани" (every event's custom menu, so the kitchen sees what to cook). Staff see both; only a manager changes a custom menu. Upcoming events first; past events' custom menus fold into "Поминати", where a manager can **delete** them. |

## 3. Data model

New migration(s), next free numbers:

- **`event_menu_templates`** (exists, 0115) — `(event_id, menu_template_id)`. Becomes the event's menu list. Writes only through the manager-gated event routes (service role), as today.
- **Drop** `events.menu_template_id` (and its same-venue check in the 0045 trigger, the 0117 staff column grant, the 0112 RPC parameters). `create_event_full` / `update_event_full` take only the list; `update_event_full` gains `p_menu_template_ids` and replaces the event's rows in the same transaction.
- **New `event_guest_menu_counts`** — `(guest_id → event_guests, menu_template_id → menu_templates, count int > 0)`, primary key `(guest_id, menu_template_id)`. A check (trigger) that `menu_template_id` is one of the guest's event's menus. Written and read only server-side (service role) by the couple's routes and the public RSVP — like the rest of the guest list, venue staff have no access to it; the venue sees only the sent numbers (`event_menu_submissions`).
- **Drop** `event_guests.menu_choice` (replaced by the counts).
- **New `event_menu_submissions`** — one row per sending: `id, event_id, sent_at, sent_by_name (organizer or co-organizer), counts jsonb { menu_template_id: count }, menu_titles jsonb (titles at send time, so a later rename doesn't rewrite history), seen_at, seen_by_manager`. The latest row is what the venue sees; the one before it gives the difference. Inserted only by the couple's send route; `seen_*` set only by the manager-gated "Видено" route.
- **Custom menus (M13)** reuse packages: `menu_templates` gains a nullable `event_id` (→ events, on delete cascade). A template with `event_id` set is that event's custom menu: listed only in Мени/Пакети's custom section (M14), never offered for any other event, linked to its event through `event_menu_templates` like any package, and composed with the same `menu_template_items` (so `replace_menu_template_items`, 0118, saves its dishes atomically). Creating one goes through a manager-gated route that checks the event's `custom_menu` entitlement.
- **Deleting a past custom menu (M14)**: allowed only for a custom menu whose event date has passed, through a manager-gated route. Its `event_menu_templates` link and the guests' counts for it go with it (cascade); the event's sent numbers (`event_menu_submissions`) are kept, and still show the menu by the title stored at sending time.
- **Drop** `event_custom_menu_items` (replaced by event-only templates), `event_menu_item_quantities`, and the RPCs `set_event_menu_template`, `set_event_menu_custom`, `replace_menu_item_quantities`. The `custom_menu` plan feature **stays** (key, plans, admin UI); only what it unlocks moves from the couple to the manager.

The database will be emptied before launch, so no data is migrated; the migrations must still run cleanly on the current schema.

## 4. Venue side

- **New-event wizard:** unchanged UI (already multi-select). Saves the list only.
- **Event window, Мени:** the single select becomes a multi-select of the venue's packages (chips), each with **Погледни мени**. When the event's plan includes `custom_menu`, a **"+ Сопствено мени"** button opens the dish picker (the same one the package builder uses) to build or edit this event's custom menu; when it doesn't, the button shows the usual locked-feature hint instead. Manager-only like the other fields; plain staff see the chips read-only. Removing a menu that guests already chose shows a warning ("3 гости го избрале ова мени — нивниот избор ќе се избрише"); on save those guests' counts for it are deleted and they show as missing a menu on the couple's side.
- **Event window, new "Бројки за мени" section** (visible to all staff, numbers aren't private):
  - Before any sending: "Парот сè уште не ги испратил бројките."
  - After: per menu "Класично — 180", the total, and "Испратено на 14.06 од Ана".
  - If the latest sending hasn't been seen: highlighted, with the differences ("Посно: 22 → 23") and **Видено** (manager only; everyone sees the highlight).
- **Настани list:** the menu column shows all titles (or "Без мени"); a small marker on events with unseen new numbers.
- **Package delete warning** (`countEventsUsingTemplate`) counts only `event_menu_templates`.
- **Мени / Пакети page, two sections (M14):**
  - **Стандардни пакети** — the venue's reusable packages, unchanged (staff create and edit them, as today).
  - **Сопствени менија за настани** — each event's custom menu as a card: the event ("Ана и Марко · 14.06.2027"), its dishes, the latest sent numbers for it ("42 гости") if any, and **Отвори настан**. Staff see them; only a manager edits (the same dish picker as the event window) or uses **Направи стандарден пакет**, which copies the dishes into a new standard package and leaves the original on its event.
  - Upcoming events first, by date. Past events' custom menus are folded under **Поминати**, where each card has a manager-only **Избриши** (with a confirm). Custom menus of upcoming events can't be deleted from here — the menu is removed from the event in the event window instead, with the guest-count warning above.

## 5. Couple side

- **Мени page (view-only):** each menu's title and dishes by course, plus — when the event has 2+ menus — the live counts from the guest list.
- **Guest list:**
  - each attending guest shows their menu counts ("Класично 3 · Посно 1") or **"Нема избрано мени"**;
  - editing a guest lets the couple set the counts (only when 2+ menus) and the answer itself;
  - a summary at the top: totals per menu and how many guests are not done.
- **Send numbers** (in the guest-list summary):
  - disabled while anyone isn't done, listing who ("Уште 5 гости: …");
  - enabled when everyone is done: **"Испрати ги бројките до салата"**, with a confirm showing the numbers;
  - after sending: "Испратено на … " and, if the guest list changed since, "Има промени од последното испраќање: Посно +1" with **"Испрати ажурирани бројки"**.
- Only the couple's **main login** sends: a co-organizer sees just their own side's guests, so they can't confirm that everyone has answered. Co-organizers still see the totals. The sending records when it happened.
- **Couple dashboard** menu status (`lib/couple/dashboard.ts`) lists the menu titles.

## 6. Guests (RSVP)

- Both RSVP paths (personal link and the public invitation with name matching) go through `lib/couple/rsvp.ts`; the rule lives there, server-side.
- One menu: no question; nothing is stored per menu (the single menu is implied).
- 2+ menus and "Ќе присуствувам": one number field per menu (package title), which must add up to the party size; the form explains the mismatch ("Изберете мени за сите 4 лица").
- "Не доаѓам" / "Подоцна": no menu question.
- The invitation page shows each menu's title and dishes (instead of the single menu).
- The reminder email copy asks to confirm attendance **and** menus; its link opens the same RSVP.

## 7. Permissions

| Action | Plain staff | Manager | Couple / co-organizer | Guest |
|---|---|---|---|---|
| See event's menus | ✅ | ✅ | ✅ (view-only) | ✅ (titles + dishes) |
| Change event's menus | ❌ | ✅ | ❌ | ❌ |
| Build/edit the event's custom menu (plan permitting) | ❌ | ✅ | ❌ | ❌ |
| See custom menus in Мени / Пакети | ✅ | ✅ | ❌ | ❌ |
| Copy a custom menu into a standard package | ❌ | ✅ | ❌ | ❌ |
| Delete a past event's custom menu | ❌ | ✅ | ❌ | ❌ |
| Set a guest's menu counts | ❌ | ❌ | ✅ (guest list) | ✅ (own RSVP) |
| Send numbers | ❌ | ❌ | ✅ (main login only) | ❌ |
| See sent numbers | ✅ | ✅ | ✅ | ❌ |
| Mark new numbers "Видено" | ❌ | ✅ | ❌ | ❌ |

All writes are server-side and re-checked there (manager elevation for the venue; couple session for the couple; the RSVP's own token/slug for guests).

## 8. Relation to the change-marks feature

The "new numbers, Видено" highlight (M11) is the first concrete case of the paused change-marks design (couple↔venue marks with a Видено button). This feature builds it narrowly — one section, one marker on the event list — with the same rules that design agreed (everyone sees it, a manager confirms, it clears only on Видено). The general feature will later absorb it rather than duplicate it.

## 9. Testing

- **Database:**
  - an event-only custom menu is never offered for another event, and is deleted with its event;
  - a past event's custom menu can be deleted by a manager only, an upcoming one not at all from Мени / Пакети; the event's sent numbers survive the deletion with the stored title;
  - the counts must belong to the event's menus;
  - writes are refused for plain staff;
  - removing an event's menu deletes guests' counts for it;
  - a submission is inserted only by the couple route, and `seen_*` only by a manager.
- **Routes:**
  - a manager edits the menus, and staff are refused;
  - a manager builds a custom menu only when the event's plan includes `custom_menu`;
  - the RSVP refuses incomplete counts with 2+ menus, and stores nothing with one menu;
  - the couple's send is refused while a guest isn't done;
  - the snapshot and the difference are correct.
- **Components:**
  - the Мени page is read-only;
  - the guest-list counts and the not-done list;
  - the send button's states;
  - the venue's numbers section and Видено;
  - Мени / Пакети's two sections, the "Поминати" fold, and which buttons staff vs. managers get.
- **E2E:** create an event with 2 menus → a guest answers through RSVP → the couple sets one guest by hand → sends → the venue sees the numbers.
- **Removals:** no remaining code or tests reference the dropped tables, RPCs or column; the `custom_menu` feature still gates the manager's custom menu.

## 10. Out of scope (later)

- Guest-facing tags per menu ("Посно", "Стандардно"…) instead of package titles (M5).
- Naming which person in a party eats which menu (counts only, per M7).
- A printable kitchen sheet.
- The general change-marks feature (§8) — **the next piece of work after this one**, rolled out everywhere it was agreed, absorbing this feature's first version.
