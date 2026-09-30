# Сесија 1 — Admin панел, нивоа и пакети

**Прво прочитај:** `docs/MASTER.md` (цел), потоа `docs/superpowers/specs/2026-09-29-admin-dashboard-design.md` и `docs/superpowers/plans/2026-09-29-admin-dashboard.md`.

**Branch:** `s1-admin` · **Миграции:** `0047`–`0059` · **Hub префикс:** `[S1]`

## Цел
Сопственикот на продуктот има admin панел на `admin.<domain>` (TOTP задолжително) со надзор над сите сали и настани, и систем на нивоа/пакети каде секоја функција се заклучува/отклучува и има лимити — по сала (ниво) и по настан (дополнителни бенефиции). MASTER ставки: **E1, E2, E3** (+ E4 само архитектонски).

## Обем
1. **Изврши го постојниот план** (`docs/superpowers/plans/2026-09-29-admin-dashboard.md`) — Фази 1–4, задача по задача, TDD, со гејтовите од планот. Планот е одобрен.
2. **Проширување на каталогот (задолжително, пред Task 2.2):** покрај 17-те клучеви од планот, додај ги и договорените од MASTER §7:
   - switch: `photo_album`, `guest_greetings`, `video_greetings`, `reminders`, `personal_invite_links`, `print_qr` (сите scope `event`)
   - limit: `storage_gb`, `photo_retention_days`, `co_organizers` (сите scope `event`)
   Ажурирај: `lib/entitlements/features.ts`, check constraint листите во 0048 (plan_features, venue_feature_overrides, event_feature_overrides), `unnest(array[...])` во default план и `effective_features`, тестовите што очекуваат `17` → вистинскиот број. Default план „Стандарден“: сите отклучени, лимити null (неограничено) — освен `storage_gb` = 5 и `photo_retention_days` = 15 (START ниво; усогласи со Сесија 4 преку Hub белешка).
3. **Семе-пакети (E3)** — миграција `0051_seed_packages.sql` (или следна слободна во опсегот): нивоа START (default), PREMIUM, PREMIUM+, ULTRA според слика `productioncheck/img/0-02-05-ee847208…jpg`:
   - START: сè основно; `storage_gb` 5, `photo_retention_days` 15, `video_greetings` заклучено.
   - PREMIUM: `storage_gb` 20, retention 30, video отклучено.
   - PREMIUM+: 50 GB, 40 дена, + `reports`.
   - ULTRA: 100 GB, 60 дена, сè.
   Цените (2.000 / 4.000 / 6.000 ден) се чуваат во `plans.description` засега (без плаќање). Постојните сали остануваат на default нивото.
4. **Приказ на бенефити (E3):** кај парот и во venue панелот, заклучена функција покажува банер (Task 2.8 од планот) — додај и линк „Види пакети“ до мала страница `/couple/packages` (read-only листа на нивоата и што отклучуваат), без плаќање.
5. **E4 плаќање:** само забелешка во `docs/production/DECISIONS.md` — активација рачно од admin (event override / промена на ниво). Не градиш checkout.

## Договори со другите сесии
- Ти си сопственик на `lib/entitlements/*`, `lib/api/handler.ts` (`feature` опција), `proxy.ts`, `lib/audit.ts`.
- Кога `withCoupleEvent({ feature })` ќе биде готово, објави Hub белешка „feature gate ready“ со листата клучеви — другите сесии ги додаваат на своите рути.
- `CoupleShell`/`PanelShell` ги поседува Сесија 4 (responsive). Task 2.8 (lock UI) — направи ги измените минимални и изолирани (нов prop `lockedFeatures`, нова компонента `LockedBanner`); ако фајлот е веќе сменет од Сесија 4 при спојување, корисникот ќе го реши конфликтот.
- Admin D2 правило: admin никогаш не чита гостински податоци. Новите табели од други сесии (`event_seat_assignments`, `event_photos`, `event_greetings`, `event_co_organizers`, `event_reminders`) додај ги во `PRIVATE_TABLES` во `tests/security/admin-static.test.ts`.

## Прифаќање
- Сите задачи од планот + точки 2–4 завршени, тестовите од планот зелени.
- `admin.localhost:3000` → најава + TOTP → Преглед, Сали, Настани, Нивоа, Пораки, Audit, Систем работат.
- Сопственикот може да: направи ниво, го додели на сала, отклучи „распоред“ само за еден настан, блокира сала.
- Постојните сали/тестови непроменети (default ниво).
- `docs/production/ADMIN.md` напишан.

## Старт (залепи во нова Claude сесија)
> Ти си Сесија 1. Прочитај `docs/MASTER.md` и `docs/sessions/SESSION-1-admin.md` и изврши го. Работи на branch `s1-admin`. Користи superpowers:subagent-driven-development врз `docs/superpowers/plans/2026-09-29-admin-dashboard.md`, со проширувањата од брифот. Не комитирај — по секоја задача дај ми git команди без co-author.
