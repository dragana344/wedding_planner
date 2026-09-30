# Сесија 3 — Распоред и сали: план за задачи 2–11

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Парот седнува гости по столче, ги гледа сите листи, масите се бојат по пополнетост, се групираат со повеќестепен undo/redo, распоредот ги има вистинските елементи на салата, venue со повеќе сали почнува со избор на сала, планот и QR по маса се печатат, а venue placeholder страните стануваат реални или скриени.

**Architecture:** Седењето живее во `event_seat_assignments` (0070, готово). Броевите и капацитетот на масите ги дава една SQL функција (`event_room_tables`) и UI никогаш не ги пресметува сам. Историјата на уредување (undo/redo) се чува на сервер како стек од snapshots (елементи + седења) по сала, во jsonb колона на `events`. Логиката на стекот е чист TS модул со unit тестови. Новите типови елементи ги прошируваат постојните check-ови од 0012 и додаваат `table_role`. Не се прават нови табели за елементи.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres/RLS/Storage), zod, vitest (unit + db), Playwright, `qrcode` (веќе во `package.json`).

**Spec:** `docs/MASTER.md` (дел 4.B, 5, 7) + `docs/sessions/SESSION-3-seating.md`.

## Global Constraints

- Branch `s3-seating`, worktree `~/Desktop/wedding_planner-s3`. Миграции **само** `0071`–`0079`; постоечките не се менуваат.
- Локалната база е заедничка. Миграцијата се применува со `psql` во трансакција + insert во `supabase_migrations.schema_migrations` (`migration up` паѓа поради 0060 од С2). Без `db reset`.
- Нови табели/колони: RLS + `revoke … from anon, authenticated` + експлицитни grant-ови; функции `revoke all … from public`; `security definer` секогаш со `set search_path = public, extensions, pg_temp`. Секоја нова колона во `tests/supabase/privacy-classification.ts`, а секоја нова табела во `rls_guard.test.ts` и `rls_isolation.test.ts`.
- API рути преку `withCoupleEvent` + zod шема од `lib/api/schemas.ts`. Пораките кон корисникот се намерни и на македонски.
- Шеговите на shell фајловите (`nav.ts`, `CoupleShell.tsx`, `PanelShell.tsx`, `panel.css`) ги поседува С4. Јас менувам **само** ставка во nav низата и додавам CSS класи со префикс `.s3-` на крајот од `panel.css` (или во сопствен CSS модул).
- Гостински/печатени страни: крем `#F5EFE4` + злато `#B8913A`, серифни italic бројки. Venue/couple панел: постојниот стил.
- Уредувачот мора да работи на touch/таблет: pointer events + копчиња +/− за зум.
- Гејтови пред секој commit: `npm run typecheck && npm run lint && npm run test:unit` + релевантните `npx vitest run -c vitest.db.config.ts <files>`. На крај на фазата: целиот `test:db` + `npx playwright test`.
- Claude не комитира. По секоја задача корисникот добива `git add … && git commit -m "…"` без co-author.
- Пред нов task: `privacy_guard` паѓа поради колоните на С2 (0060). Тоа е познато и не е регресија.

## Review Focus

1. **Гостин избришан или со намален `party_size` откако е седнат** → листата не паѓа. Столчињата над новиот `party_size` остануваат видливи со предупредување, а прикажаното име доаѓа од гостинот (Task 2 тест).
2. **Масата е заменета со помал тип / избришана / „врати стандардно“** → UI предупредува колку места ќе се ослободат пред да изврши, а по тоа седењата се чистат (`prune`) и повторно се враќаат со undo (Task 2 + Task 5 тестови).
3. **Undo по confirm или по промена од staff во live** → undo на парот го враќа само нивниот нацрт и нивните седења. Не смее да ги избрише масите додадени од staff во live (Task 5 тест).
4. **Две табови/уреди истовремено** → вторично вметнување на исто столче враќа јасна порака „Столчето е зафатено“ (23505 → 409), а не 500 (Task 2 тест).
5. **Venue со една сала** → чекорот „избор на сала“ не се прикажува и сè работи како досега (Task 7 тест). **Долги имиња / кирилица во CSV и печат** → UTF-8 BOM во CSV, скратување со `…` на картичките (Task 3 и Task 9 тестови).

---

## Мапа на фајлови

| Фајл | Одговорност | Задача |
|---|---|---|
| `supabase/migrations/0071_seat_rpcs.sql` | `replace_table_seats`, `event_seat_list` (staff), `event_room_tables_for_staff` | 2 |
| `lib/seating/seats.ts` (нов, server-only) | читање/запис на седења за пар (service role) + за staff | 2, 3 |
| `lib/seating/occupancy.ts` (нов, чист) | `occupancyOf(capacity, taken)` → `'free'|'partial'|'full'`, бои | 4 |
| `lib/seating/history.ts` (нов, чист) | стек undo/redo: `push`, `undo`, `redo`, cap 50 | 5 |
| `lib/seating/csv.ts` (нов, чист) | CSV извоз (маса, столче, гостин) | 3 |
| `app/api/couple/seating/seats/route.ts` (нов) | GET листи + гости, PUT седења на една маса | 2 |
| `app/api/couple/seating/redo/route.ts` (нов), `undo`, `group` | redo; undo преку стек; групирање | 5 |
| `components/seating/TableSeatsPanel.tsx` (нов) | нумерирана листа 1…N, autocomplete, drag помеѓу столчиња, бројач | 2 |
| `components/seating/AllTablesView.tsx` (нов) | grid на сите листи, осветлување на маса, CSV/печат | 3 |
| `components/venue/dashboard/EventSeatingPage.tsx` | вклучува панели, бои, групи, undo/redo, нови типови | 2–6 |
| `components/venue/dashboard/FloorPlanCanvas.tsx` | `highlight`, `groupId` оквир, `fill` по пополнетост, зум +/−, touch | 4–6 |
| `supabase/migrations/0072_layout_groups_history.sql` | `group_id` на елементи, `events.seating_history`, `events.layout_history`, `restore_room_seats` | 5 |
| `supabase/migrations/0073_element_types.sql` | проширени `element_type`, `table_role` | 6 |
| `scripts/seed-leona-lux-layout.mjs` (нов) | демо распоред Leona Lux | 8 |
| `components/venue/NewEventForm.tsx`, `app/venue/events/new/page.tsx`, `DashboardClient.tsx`, `app/venue/calendar/*` | сала прва, филтер по сала | 7 |
| `supabase/migrations/0074_venue_profile.sql` | `venues.address`, `phone`, `logo_path` | 10 |
| `components/venue/dashboard/SettingsClient.tsx`, `lib/venue/venue-profile.ts` | профил + лого | 10 |
| `app/venue/events/[eventId]/print/plan/page.tsx`, `app/couple/(protected)/seating/print/page.tsx`, `components/seating/print/*` | A4 план + QR картички | 9 |
| `app/venue/reports/page.tsx`, `lib/venue/reports.ts` | реални извештаи | 11 |
| `app/venue/notifications/page.tsx`, `lib/venue/notifications.ts` | audit + нови настани | 11 |
| `components/venue/shell/nav.ts` | `Пораки` отстранета; `Известувања`/`Извештаи` `ready: true` | 11 |

Редослед: 2 → 3 → 4 → 5 → 6 → 8 → 7 → **10 → 9** (логото мора да постои пред печатот) → 11. Бројевите на задачите се од брифот.

---

### Task 2: Листа по маса (B1)

**Files:**
- Create: `supabase/migrations/0071_seat_rpcs.sql`, `lib/seating/seats.ts`, `app/api/couple/seating/seats/route.ts`, `components/seating/TableSeatsPanel.tsx`
- Modify: `lib/api/schemas.ts` (нова шема `seatsPutBody`), `lib/couple/seating.ts` (по `deleteElement`/`revertToStandard`/`confirm` → `prune_event_seat_assignments`), `lib/couple/seating-client-actions.ts`, `components/venue/dashboard/EventSeatingPage.tsx`
- Test: `tests/supabase/seat_rpcs.test.ts`, `tests/lib/seating/seats-route.test.ts` (db), `tests/components/seating/TableSeatsPanel.test.tsx` (unit)

**Interfaces:**
- Consumes: `event_seat_assignments`, `event_room_tables(event, room)`, `prune_event_seat_assignments(event)` (0070).
- Produces:
  ```ts
  // lib/seating/seats.ts
  export interface SeatTable { elementId: string; label: string | null; number: number; capacity: number; }
  export interface Seat { elementId: string; seatNumber: number; guestId: string | null; guestName: string | null; displayName: string; }
  export interface SeatGuest { id: string; fullName: string; partySize: number; seatsTaken: number; side: "bride" | "groom" | null; }
  export interface RoomSeating { tables: SeatTable[]; seats: Seat[]; guests: SeatGuest[]; }
  export async function getRoomSeating(eventId: string, roomId: string): Promise<RoomSeating>;           // service role
  export async function replaceTableSeats(eventId: string, roomId: string, elementId: string,
    seats: { seatNumber: number; guestId?: string | null; guestName?: string | null }[]): Promise<Seat[]>;
  export async function getRoomSeatingForStaff(client: SupabaseClient, eventId: string, roomId: string): Promise<RoomSeating>; // guests: []
  export function tableTitle(t: SeatTable): string; // label ?? `Маса ${number}`
  ```
  SQL:
  ```sql
  replace_table_seats(p_event_id uuid, p_room_id uuid, p_element_id uuid, p_seats jsonb) returns void  -- service_role; delete + insert in one tx
  event_seat_list(p_event_id uuid, p_room_id uuid) returns table(element_id uuid, seat_number int, guest_id uuid, display_name text)
    -- security definer; raises 42501 unless service_role or is_venue_staff_for(event's venue)
  event_room_tables_for_staff(p_event_id uuid, p_room_id uuid) returns setof (same as event_room_tables) -- same check
  ```
  API: `GET /api/couple/seating/seats?room_id=` → `RoomSeating`; `PUT /api/couple/seating/seats` body `{ room_id, layout_element_id, seats: [{ seat_number, guest_id?, guest_name? }] }` (max 1000 столчиња, `guest_name` ≤ 200) → `{ seats }`; 23505/23514 → 409 со „Столчето е зафатено или надвор од масата.“

- [ ] **Step 1: DB тестови (падат)** — `tests/supabase/seat_rpcs.test.ts`:
  - `replace_table_seats` ги заменува седењата на масата атомично: лош ред (seat 99) → ништо не е сменето;
  - `event_seat_list` враќа `display_name` = `full_name` на гостинот за поврзаните, `guest_name` за слободен текст;
  - staff на друга сала → `42501`; anon → `42501`; staff на својата сала → редови;
  - `event_room_tables_for_staff` исто правило.
- [ ] **Step 2:** `npx vitest run -c vitest.db.config.ts tests/supabase/seat_rpcs.test.ts` → FAIL (функцијата не постои).
- [ ] **Step 3:** Напиши `0071_seat_rpcs.sql`:
  ```sql
  create or replace function public.replace_table_seats(p_event_id uuid, p_room_id uuid, p_element_id uuid, p_seats jsonb)
  returns void language plpgsql set search_path = public, extensions, pg_temp as $$
  begin
    delete from event_seat_assignments where event_id = p_event_id and layout_element_id = p_element_id;
    insert into event_seat_assignments (event_id, room_id, layout_element_id, seat_number, guest_id, guest_name)
    select p_event_id, p_room_id, p_element_id, s.seat_number, s.guest_id, s.guest_name
    from jsonb_to_recordset(coalesce(p_seats, '[]'::jsonb)) as s(seat_number int, guest_id uuid, guest_name text);
  end $$;
  -- event_seat_list / event_room_tables_for_staff: security definer,
  -- if not (auth.role() = 'service_role' or exists(select 1 from events e where e.id = p_event_id and is_venue_staff_for(e.venue_id)))
  --   then raise exception 'not allowed' using errcode = '42501'; end if;
  -- revoke all from public, anon, authenticated; grant execute: replace_table_seats → service_role; другите две → authenticated, service_role
  ```
  Примени со psql (Global Constraints) → Step 1 PASS.
- [ ] **Step 4: route тест (db)** `tests/lib/seating/seats-route.test.ts`: GET враќа `tables` со `number` 1..N по редот на нацртот; PUT со гостин од друг настан → 409; PUT со `party_size` надминат → 409; PUT на зафатено столче (паралелно) → 409; сесија за настан A не може да пише во сала на настан B (→ 404, по примерот на `couple-authz.test.ts`). Додај ја рутата во листата на `tests/supabase/couple-authz.test.ts`.
- [ ] **Step 5:** Имплементирај `lib/seating/seats.ts` + рутата + `seatsPutBody` во `schemas.ts`. Мапирај Postgres `23505`/`23514` → 409 во рутата (не во handler.ts, тој е на С1). Во `lib/couple/seating.ts`: по `deleteElement`, `revertToStandard`, `resizeElement` (ако се смени типот) и `confirm` повикај `client.rpc("prune_event_seat_assignments", { p_event_id })`.
- [ ] **Step 6: компонентен тест (unit, jsdom)** `TableSeatsPanel.test.tsx`:
  - маса со капацитет 10 → 10 нумерирани полиња и бројач „2/10“ за 2 зафатени;
  - autocomplete покажува само гости со `seatsTaken < partySize`, а веќе избраниот гостин е во своето поле;
  - слободен текст се зачувува како `guestName`;
  - drag (pointer events: `pointerdown` на ред 1, `pointerup` на ред 3) ги заменува столчињата 1 и 3 → еден `onSave` со двете;
  - гостин со `seatsTaken > partySize` → предупредување „Повеќе места од бројот на лица“.
- [ ] **Step 7:** Имплементирај `TableSeatsPanel` (props: `table: SeatTable`, `seats: Seat[]`, `guests: SeatGuest[]`, `onSave(seats) => Promise<void>`, `readOnly?: boolean`). Во `EventSeatingPage`: клик на маса → `selectedId` → панел десно (на мобилен долу, `max-height: 50vh`). За staff `readOnly` + податоци од `getRoomSeatingForStaff`. Бришење маса со седнати гости → `window.confirm("Масата има N седнати гости. Местата ќе се ослободат.")`.
- [ ] **Step 8:** Гејтови + `git add … && git commit -m "feat(seating): per-table seat list with guest autocomplete (B1)"`.

### Task 3: Сите листи + CSV (B2)

**Files:** Create `components/seating/AllTablesView.tsx`, `lib/seating/csv.ts`; Modify `EventSeatingPage.tsx`, `FloorPlanCanvas.tsx` (`highlightedIds?: string[]`); Test `tests/lib/pure/seating-csv.test.ts`, `tests/components/seating/AllTablesView.test.tsx`.

**Interfaces:** Consumes `RoomSeating`, `tableTitle`. Produces `export function seatingCsv(roomName: string, data: RoomSeating): string` (колони `Сала;Маса;Столче;Гостин`, разделувач `;`, `﻿` BOM, `"` escape, празни столчиња се изоставени).

- [ ] **Step 1:** Unit тест за `seatingCsv`: BOM, редослед по маса → столче, име со `;` и `"` е правилно escape-нато, кирилица непроменета.
- [ ] **Step 2:** FAIL → имплементирај → PASS.
- [ ] **Step 3:** Компонентен тест: копче „Сите маси“ → grid со картичка по маса (наслов, „7/10“, листа); клик на картичка → `onHighlight(elementId)`; копче „Извези CSV“ → `Blob` со `text/csv;charset=utf-8`.
- [ ] **Step 4:** Имплементирај. Canvas: `highlightedIds` цртаат дебел златен оквир (`#B8913A`, 3px). „Печати листи“ = `window.print()` со `@media print`, кој го крие планот и ги печати само картичките (класа `.s3-print-lists`).
- [ ] **Step 5:** Гејтови + commit `feat(seating): all-tables view, highlight and CSV export (B2)`.

### Task 4: Пополнетост (B5)

**Files:** Create `lib/seating/occupancy.ts`; Modify `EventSeatingPage.tsx`, `FloorPlanCanvas.tsx` (`CanvasElement.fill?`, `badge?: string`); Test `tests/lib/pure/occupancy.test.ts`.

**Interfaces:**
```ts
export type Occupancy = "free" | "partial" | "full";
export function occupancyOf(capacity: number, taken: number): Occupancy; // 0 → free, >=capacity → full
export const OCCUPANCY_COLORS: Record<Occupancy, string> = { free: "#E7F3EA", partial: "#F6E7C1", full: "#E9C9C9" };
export const COUPLE_TABLE_COLOR = "#B9A3E3"; export const PILLAR_COLOR = "#9CA3AF";
```
- [ ] **Step 1:** Unit тестови: `(10,0)`→free, `(10,3)`→partial, `(10,10)`→full, `(10,12)`→full, `(0,0)`→free.
- [ ] **Step 2:** FAIL → имплементирај → PASS.
- [ ] **Step 3:** EventSeatingPage: масите имаат `fill` по пополнетост и `badge` „7/10“; легенда под планот (Слободна / Делумно / Полна / Маса на младенци / Столб). Компонентен тест: маса со 10/10 рендерира `data-occupancy="full"`.
- [ ] **Step 4:** Гејтови + commit `feat(seating): colour tables by occupancy with legend (B5)`.

### Task 5: Групирање + повеќестепен undo/redo (B3)

**Files:** Create `supabase/migrations/0072_layout_groups_history.sql`, `lib/seating/history.ts`, `app/api/couple/seating/redo/route.ts`, `app/api/couple/seating/group/route.ts`; Modify `lib/couple/seating.ts`, `lib/venue/floorplan.ts`, `EventSeatingPage.tsx` (`SeatingActions` добива `redo`, `group`, `ungroup`, `historyState`), `FloorPlanCanvas.tsx` (multi-select со Shift/долг притисок, испрекинат оквир околу група), `app/api/couple/seating/undo/route.ts`; Test `tests/lib/pure/seating-history.test.ts`, `tests/supabase/layout_history.test.ts`, `tests/lib/couple/seating-history.test.ts` (db).

**Interfaces:**
```ts
// lib/seating/history.ts — pure
export interface LayoutSnapshot { elements: EventLayoutElement[]; seats: SnapshotSeat[]; }
export interface SnapshotSeat { layout_element_id: string; seat_number: number; guest_id: string | null; guest_name: string | null; }
export interface History { past: LayoutSnapshot[]; future: LayoutSnapshot[]; }
export const HISTORY_LIMIT = 50;
export function emptyHistory(): History;
export function record(h: History, current: LayoutSnapshot): History;           // push current to past, clear future, cap
export function undo(h: History, current: LayoutSnapshot): { history: History; restore: LayoutSnapshot } | null;
export function redo(h: History, current: LayoutSnapshot): { history: History; restore: LayoutSnapshot } | null;
```
SQL 0072:
```sql
alter table room_layout_elements add column group_id uuid;
alter table event_layout_elements add column group_id uuid;
alter table events add column seating_history jsonb not null default '{}'::jsonb;  -- { room_id: History } (парот)
alter table events add column layout_history jsonb not null default '{}'::jsonb;   -- { room_id: History } (staff)
-- confirm_event_seating: го пренесува и group_id (create or replace, иста сигнатура)
restore_room_seats(p_event_id uuid, p_room_id uuid, p_seats jsonb) returns integer
  -- service_role; го брише седењето на салата, вметнува само редови чиј гостин уште постои и чија маса е во event_room_tables; враќа број на вратени
```
Класификација: `seating_history: P`, `layout_history: P`, `group_id: N`. Erasure: тригер `events_erase_seat_assignments` (0070) се проширува во 0072 да ги празни и `seating_history`/`layout_history` (create or replace на функцијата). `privacy.test.ts` `remainingPersonalData` третира `seating_history`/`layout_history` како `'{}'`.

- [ ] **Step 1:** Unit тестови за `history.ts`: 25 × `record` → `undo` 20 пати по ред ги враќа snapshots во обратен редослед; `redo` по `undo` го враќа следниот; `record` по `undo` ја брише `future`; cap 50 (51-виот record го фрла најстариот); `undo` на празно → `null`.
- [ ] **Step 2:** FAIL → имплементирај → PASS.
- [ ] **Step 3:** DB тестови `layout_history.test.ts`: колоните постојат; `confirm_event_seating` го чува `group_id`; `restore_room_seats` прескокнува избришан гостин и враќа точен број; erasure ги празни историите.
- [ ] **Step 4:** 0072 → psql → PASS. Ажурирај `privacy-classification.ts`, `privacy.test.ts`.
- [ ] **Step 5:** db тест за `coupleSeatingActionsFor`: група од 2 маси → undo → масите немаат `group_id` → redo → имаат; сценарио од клиентот: групирај → седни гостин на групата → премести → „врати стандардно“ → undo ×1 враќа пред „стандардно“ (со седењето) → undo ×2 → пред групирањето; staff додал маса во live по confirm → undo на парот не ја допира live табелата.
- [ ] **Step 6:** Имплементирај: секоја мутација во `lib/couple/seating.ts` (add/move/resize/rotate/delete/revert/group/ungroup) прво прави `record(history, snapshotOf(room))` и го запишува `seating_history[room]`. `undo`/`redo` → `restore`: `replaceDraftRoom` + `restore_room_seats`. Групата е `group_id` кој го делат избраните маси; збирен капацитет = сума. Staff (`lib/venue/floorplan.ts`): исто со `layout_history` (browser client, RLS на `events` веќе дозволува update). `captureEventLayoutSnapshot`/`layout_undo_snapshot` остануваат за компатибилност, но не се користат (колоната не се брише). Старата `seating_draft_undo` не се користи повеќе.
- [ ] **Step 7:** UI: копчиња „↶ Врати“ / „↷ Повтори“ (disabled според `past.length`/`future.length`, кои ги враќа серверот како `historyState: { canUndo, canRedo }`), „+ Групирај“ (≥2 избрани маси), „Разгрупирај“. Canvas: испрекинат (`stroke-dasharray`) правоаголник околу bbox на групата + наслов „Група · 20 места“. Тастатура: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z.
- [ ] **Step 8:** Гејтови + commit `feat(seating): table groups and multi-step undo/redo (B3)`.

### Task 6: Типови елементи (B4)

**Files:** Create `supabase/migrations/0073_element_types.sql`; Modify `lib/venue/floorplan.ts` (типови + бои + `TABLE_ROLE_LABELS`), `RoomFloorPlanPage.tsx`, `EventSeatingPage.tsx`, `lib/couple/seating.ts` + `lib/api/schemas.ts` (нови вредности, `table_role`, уредување `label`), `confirm_event_seating` во 0073 (го пренесува `table_role`); Test `tests/supabase/element_types.test.ts`, дополнување на `tests/lib/venue/floorplan.test.ts`.

**Interfaces:**
```sql
-- room_fixed_elements.element_type: + 'entrance', 'wc'
-- room/event_layout_elements.element_type: + 'music', 'photo_stage'   (dance_floor, stage, bar_movable веќе постојат)
alter table room_layout_elements  add column table_role text not null default 'guest' check (table_role in ('guest','couple','head'));
alter table event_layout_elements add column table_role text not null default 'guest' check (table_role in ('guest','couple','head'));
```
```ts
export type TableRole = "guest" | "couple" | "head";
export const TABLE_ROLE_LABELS: Record<TableRole, string> = { guest: "Маса", couple: "Маса на младенците", head: "Главна маса" };
```
- Слободна нумерација: `label` станува ознака на масата што може да се уредува (поле во панелот на масата). `handleAddTable` веќе **не** става `label = tableType.name`. Постоечките ознаки еднакви на името на типот → се прикажуваат како „Маса N“ (`tableTitle` ги игнорира ако `label === tableType.name`).
- Маса на младенците и главна маса се нумерираат ли? Не: `event_room_tables.ord` ги брои само `table_role = 'guest'`, а другите го носат називот од `TABLE_ROLE_LABELS` (create or replace на `event_room_tables` во 0073, иста сигнатура).

- [ ] **Step 1:** DB тестови: новите вредности се прифаќаат, непознати се одбиваат (23514); `table_role` default `guest`; confirm го чува `table_role`; `guest_seat` за гостин на маса на младенци → „Маса на младенците“; бројот на гостинските маси прескокнува маса на младенци.
- [ ] **Step 2:** 0073 → psql → PASS; класификација `table_role: N`.
- [ ] **Step 3:** UI палета (venue стандард + пар): „+ Маса на младенците“, „+ Главна маса“ (правоаголна, роља на избран тип маса), „+ Музика“, „+ Бина за сликање“, „+ Танц подиум“, „+ Шанк“. Во venue стандардот, фиксни: „+ Столб“, „+ Влез“, „+ WC“. Натписите на македонски преку `ELEMENT_LABELS`. Бои: маса на младенци `#B9A3E3`, столб `#9CA3AF`. Комп. тест: палетата ги рендерира копчињата, а клик на „Маса на младенците“ праќа `table_role: "couple"`.
- [ ] **Step 4:** Зум: копчиња „−“ / „+“ / „100%“ над canvas (`scale` 0.5–2.0) + `touch-action: none` на canvas. Pinch не е задолжителен.
- [ ] **Step 5:** Гејтови + commit `feat(floorplan): couple/head tables, pillars, zones, table labels, zoom (B4)`.

### Task 8: Демо Leona Lux (B8)

**Files:** Create `scripts/seed-leona-lux-layout.mjs`; Test `tests/supabase/seed_leona_lux.test.ts` (db, ја извршува скриптата против локалната база).

- Скриптата бара `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` и **одбива** URL што не е `127.0.0.1`/`localhost`, освен со `--allow-remote --venue-id=<uuid>` (за демо сметката на Cloud; ја извршува само сопственикот рачно).
- Создава/користи venue „Leona Lux (демо)“, сала „Голема сала“ 3600 × 2400 cm; тип маса „Округла 10“ (180 cm, 10 места, quantity 41); тип „Главна маса“ правоаголна 600 × 90; 41 маса во мрежа според `productioncheck/wedding-shit/visual image 4.png` (редови од по 7/6 околу танц подиум во средина), 1 маса на младенците горе-центар, 5 столбови (`room_fixed_elements`, `pillar`, 60 × 60), влез долу-лево, музика горе-десно, бина за сликање лево, танц подиум центар. Idempotent: ги брише само елементите на својата демо сала пред повторно вметнување.
- [ ] **Step 1:** Тест: по извршување → 41 `table` со `table_role='guest'`, 1 `couple`, 5 `pillar`, ≥1 од секој `entrance/music/photo_stage/dance_floor`; второ извршување не дуплира; `SUPABASE_URL=https://x.supabase.co` без флаг → exit code ≠ 0.
- [ ] **Step 2:** FAIL → имплементирај → PASS. Визуелна проверка: отвори `/venue/rooms/<id>/floor-plan` локално и спореди со скицата (screenshot во одговорот).
- [ ] **Step 3:** Гејтови + commit `chore(demo): Leona Lux seed layout script (B8)`.

### Task 7: Сала прва (B6)

**Files:** Modify `components/venue/NewEventForm.tsx`, `app/venue/events/new/page.tsx` (`?room=` query), `components/venue/dashboard/DashboardClient.tsx`, `app/venue/page.tsx`, календар (`app/venue/calendar/*`, филтер `?room=`); Test `tests/components/venue/NewEventForm.test.tsx`, `tests/components/venue/dashboard/DashboardRoomFilter.test.tsx`.

- Venue со >1 сала: `NewEventForm` почнува со чекор 1 „Избери сала“ (картички со име, број маси/места од `listRoomsWithSeatTotals`, повеќекратен избор дозволен, бидејќи настанот може да користи повеќе сали) → „Продолжи“ → постојната форма со веќе избраните сали. Со 1 сала → директно формата, со однапред избрана сала.
- Контролна табла и календар: чипови за филтер „Сите / Сала 1 / Сала 2“ (`?room=`); на таблата картичка по сала (настани денес/оваа недела, пополнетост) со линк „Детали“ → `/venue/rooms/<id>/floor-plan` и листа на настаните во таа сала.
- [ ] **Step 1:** Комп. тестови: 2 сали → се рендерира чекорот и „Продолжи“ е disabled без избор; 1 сала → нема чекор, салата е избрана; `?room=<id>` ја предизбира.
- [ ] **Step 2:** FAIL → имплементирај → PASS. Филтерот: тест дека `DashboardClient` со `roomFilter` покажува само настани со таа сала.
- [ ] **Step 3:** E2E дополнување во `e2e/venue-event.spec.ts`: venue со 2 сали → нов настан почнува со избор на сала.
- [ ] **Step 4:** Гејтови + commit `feat(venue): room-first event creation and per-room dashboard filter (B6)`.

### Task 10: Venue профил (B10)

**Files:** Create `supabase/migrations/0074_venue_profile.sql`; Modify `lib/venue/venue-profile.ts`, `components/venue/dashboard/SettingsClient.tsx`, `app/venue/settings/page.tsx`, `lib/privacy/export.ts` (VENUE_COLUMNS), `lib/storage-cleanup.ts`/0038 тригер ако е потребно; Test `tests/supabase/venue_profile.test.ts`, `tests/components/venue/dashboard/SettingsProfile.test.tsx`.

```sql
alter table venues add column address text check (address is null or char_length(address) <= 300);
alter table venues add column phone text check (phone is null or char_length(phone) <= 50);
alter table venues add column logo_path text check (logo_path is null or char_length(logo_path) <= 500);
-- стариот logo_path → storage_cleanup_queue при замена/бришење (тригер по примерот на 0038)
```
- Логото оди во постоечкиот bucket `event-showcase-photos`, патека `<venue_id>/logo-<timestamp>.<ext>`. Постојните staff политики за папката на venue важат, а image лимитите од 0040 (тип/големина) исто така. Не се прави нов bucket.
- `export function venueLogoUrl(client, logoPath): string | null`. Класификација: `address: P`, `phone: P`, `logo_path: N`.
- [ ] **Step 1:** DB тест: staff ги ажурира своите полиња, туѓиот venue → 0 редови; должина > лимит → 23514; замена на лого → старата патека во `storage_cleanup_queue`; upload во туѓа папка → одбиено.
- [ ] **Step 2:** 0074 → psql → PASS. Ажурирај `privacy-classification.ts` + export.
- [ ] **Step 3:** Комп. тест: форма „Профил на локалот“ (име, адреса, телефон, лого со преглед и „Отстрани“); лош тип датотека → порака „Дозволени се PNG, JPG, WEBP до 5 MB.“
- [ ] **Step 4:** Hub белешка до С2: `venues.logo_path` + `venueLogoUrl()` постојат за поканата.
- [ ] **Step 5:** Гејтови + commit `feat(venue): profile with address, phone and logo (B10)`.

### Task 9: Печатење план + QR по маса (B7)

**Files:** Create `app/venue/events/[eventId]/print/plan/page.tsx`, `app/venue/events/[eventId]/print/qr/page.tsx`, `app/couple/(protected)/seating/print/page.tsx`, `components/seating/print/PrintPlan.tsx`, `components/seating/print/TableQrCards.tsx`, `components/seating/print/print.module.css`, `lib/seating/qr.ts`; Modify `EventSeatingPage.tsx` / `EventEditForm.tsx` (линкови „Печати план“ / „QR по маса“); Test `tests/components/seating/PrintPlan.test.tsx`, `tests/lib/pure/seating-qr.test.ts`.

**Interfaces:**
```ts
// lib/seating/qr.ts
export function tableQrTarget(origin: string, slug: string | null): string; // до договор со С2/С4: `${origin}/invite/${slug}`; без покана → `${origin}`
export async function qrSvg(text: string): Promise<string>;                  // SVG string, server-side
```
- `PrintPlan`: A4 landscape (`@page { size: A4 landscape; margin: 10mm }`), крем `#F5EFE4`, злато `#B8913A`, серифни italic бројки (`Cormorant_Garamond` преку `next/font/google`, кој се хостира локално, па CSP `font-src 'self'` е во ред; се вчитува само во print компонентите), главната маса/масата на младенците горе, лого на venue долу-десно (ако постои), имиња на паровите и датум. Планот е SVG од истите елементи, скалиран да го пополни листот. Секоја сала е посебна страница (`break-after: page`).
- `TableQrCards`: картички 2 × 3 на A4 portrait (број/назив на масата, QR, „Скенирај за покана“), страница „Како се ставаат“ со илустрација (картичка во држач на масата).
- Копче „Печати“ (`window.print()`), скриено со `@media print`.
- Пар: `/couple/seating/print` ги печати сите сали на својот настан (од нацртот). Venue: од потврдениот (live) распоред.
- [ ] **Step 1:** Unit: `tableQrTarget` со/без slug; `qrSvg` враќа `<svg`. Комп.: `PrintPlan` рендерира по една страница за сала, маса на младенци над останатите (најмал `y`), лого кога е дадено, долго име на пар скратено со CSS (`text-overflow`).
- [ ] **Step 2:** FAIL → имплементирај → PASS.
- [ ] **Step 3:** Рачна проверка: Chrome print preview → screenshot во одговорот. Hub белешка: барам URL шема за „Мојата маса“ (С2) и албум (С4); кога ќе стигне, се менува само `tableQrTarget`.
- [ ] **Step 4:** Гејтови + commit `feat(seating): printable A4 floor plan and per-table QR cards (B7)`.

### Task 11: Venue placeholders (B9)

**Files:** Create `lib/venue/reports.ts`, `lib/venue/notifications.ts`, `components/venue/dashboard/ReportsClient.tsx`, `components/venue/dashboard/NotificationsList.tsx`; Modify `app/venue/reports/page.tsx`, `app/venue/notifications/page.tsx`, `app/venue/messages/page.tsx` (→ `notFound()`), `components/venue/shell/nav.ts` (само ставките); Test `tests/lib/pure/reports.test.ts`, `tests/supabase/venue_notifications.test.ts`, `tests/components/venue/dashboard/Reports.test.tsx`.

**Interfaces:**
```ts
// lib/venue/reports.ts
export interface ReportFilters { from: string; to: string; roomId?: string }             // YYYY-MM-DD
export interface ReportData {
  byMonth: { month: string; events: number; guests: number; revenue: number; deposits: number }[];
  byType: { type: string; count: number }[]; byStatus: { status: string; count: number }[];
  byRoom: { roomId: string; roomName: string; events: number; seatCapacity: number; avgFill: number }[];
  totals: { events: number; guests: number; revenue: number; deposits: number };
}
export function buildReport(events: ReportEvent[], rooms: ReportRoom[], f: ReportFilters): ReportData; // чиста
export async function getReport(client: SupabaseClient, venueId: string, f: ReportFilters): Promise<ReportData>;
// lib/venue/notifications.ts
export interface VenueNotification { at: string; kind: "event_created" | "rsvp_changed" | "credentials_created" | "event_deleted" | "data_erased"; eventId: string | null; title: string }
export async function listVenueNotifications(client: SupabaseClient, venueId: string, limit?: number): Promise<VenueNotification[]>; // audit_log (RLS: staff read) + events.created_at
```
- Гостите во извештаите се `guest_count_estimate` (staff нема пристап до `event_guests`). Приходот е `total_price`, депозитите `deposit_paid`. Пополнетоста по сала = `guest_count_estimate / seatTotal`.
- Извештаи: филтер период (default тековна година) + сала, KPI картички, табела по месец, едноставни хоризонтални ленти (CSS, без библиотека) по тип/статус. Боите се од `dataviz` skill-от (се вчитува пред цртањето).
- Известувања: последни 50, групирани по ден. Натписите на македонски („Нов настан: …“, „Гостин го смени одговорот (…)“).
- Nav: `Известувања` и `Извештаи` → `ready: true`; `Пораки` → ставката отстранета. Hub белешка до С4.
- [ ] **Step 1:** Unit тестови за `buildReport` (групирање по месец преку граница на година, филтер по сала, настан во 2 сали се брои во двете за `byRoom`, но еднаш во `totals`, празен влез → нули).
- [ ] **Step 2:** FAIL → имплементирај → PASS.
- [ ] **Step 3:** DB тест `listVenueNotifications`: staff A гледа само свои; видови по `action` мапирани точно; `public_rsvp` → `rsvp_changed`.
- [ ] **Step 4:** Страници + комп. тест (Reports рендерира KPI и табела; Notifications празна → „Сè уште нема известувања.“). `/venue/messages` → 404; e2e `a11y.spec.ts`/`csp-pages.spec.ts` ако ја содржат, ажурирај.
- [ ] **Step 5:** Гејтови + commit `feat(venue): real reports and notifications, hide messages (B9)`.

---

## Крај на фазата

- [ ] `npm run typecheck && npm run lint && npm run test:unit && npm run test:db && npx playwright test && npm run build`.
- [ ] Одново од нула во посебна локална база? **Не** (заедничка е). Наместо тоа: `psql -f` на 0070–0074 во празна шема не е можно без reset, па пред спојувањето сопственикот пушта `supabase db reset` кога сите сесии ќе застанат. Тоа е белешка во Hub.
- [ ] Hub: секој `[S3]` task → `done`; progress update по задача.
- [ ] Прифаќање (бриф): седење по столче ✔ Task 2, сите листи ✔ 3, пополнетост ✔ 4, групирај → undo → стандардно низ повеќе чекори ✔ 5 (тестови за стекот), Leona Lux ✔ 8, сала прва ✔ 7, печат + QR ✔ 9, Извештаи/Известувања реални + Пораки скриено ✔ 11, DB тестови за seat assignments ✔ 1.
