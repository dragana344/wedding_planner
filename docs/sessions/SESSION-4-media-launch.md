# Сесија 4 — Фотографии, честитки, албум, responsive, лансирање

**Прво прочитај:** `docs/MASTER.md` (цел). Потоа: `app/couple/(protected)/album`, `greetings`, `messages` (placeholders), `components/venue/shell/ComingSoon.tsx`, `components/couple/shell/*`, `components/venue/shell/*`, `app/venue/panel.css`, `lib/storage-cleanup.ts`, миграции `0031`, `0038`, `0040`, `docs/production/A11Y.md`, `QUOTAS.md`, `SETUP.md`, `DECISIONS.md`, `RETENTION.md`.

**Branch:** `s4-media-launch` · **Миграции:** `0080`–`0089` · **Hub префикс:** `[S4]`

## Цел
Гостите скенираат QR, прикачуваат фотографии и оставаат честитка со име; парот ги гледа и презема сите; просторот е видлив и ограничен по пакет; целата апликација е употреблива на телефон; проектот има финална листа за лансирање. MASTER ставки: **C1–C10, D1–D4**.

## Дел А — Медиуми (прво)
1. **Шема (0080):** `event_photos (id, event_id, storage_path, bytes, mime, width, height, uploader_name ≤ 120 null, consent_at, hidden_at null, created_at)`, `event_greetings (id, event_id, first_name, last_name, message ≤ 1000, video_path null, video_bytes null, created_at, hidden_at)`; приватен bucket `event-media` (JPEG/PNG/WebP/HEIC→JPEG, видео MP4/WebM за video greetings), лимит по фајл 15 MB фото / 100 MB видео; нови редови во cleanup queue од 0038 при бришење; `storage_used_bytes` по настан (view или збир). RLS: staff read на својата сала, couple преку service role, јавен upload **само** преку потпишан URL од API.
2. **Јавна страница за гости (C1, C2):** `/e/<album_token>` (токен по настан, не slug на поканата) — mobile-first, крем/злато стил: „Прикачи фотографии“ (повеќе одеднаш, компресија во прелистувач до ~2560px JPEG), чекбокс согласност „Се согласувам фотографијата да биде прикажана во свадбениот албум“, и „Остави честитка“ (задолжително име и презиме + порака). Upload: API издава потпишан upload URL (како `invitation/photo`), потоа confirm со magic-byte проверка (како SEC-028). Rate limit по IP + по настан. Квота: одбиј кога `storage_gb` (entitlement, ако постои; инаку default 5 GB) е достигнат, со јасна порака.
3. **Албум кај парот (C3, C10):** grid со lazy-load, преглед, скриј/избриши (модерирање), **„Преземи ги сите“** — ZIP (стримиран од server route, или сериски батчеви ако е голем; пази на Vercel лимити — 4.5 MB body важи за request, не за streamed response), филтер по датум/прикачувач.
4. **Честитки (C2):** страница „Честитки“ кај парот — картички со име, презиме, порака, датум; видео ако има.
5. **QR шаблони (C4):** `/couple/album/qr` — печатливи картички (А6 по маса, А4 постер) со QR до `/e/<album_token>` и текст „Скенирај и сподели ги твоите фотографии“; опционално број на маса (податок од Сесија 3 ако е готов).
6. **Простор (C5, C6):** на почетна и во Албум — приказ како „мој ДДВ“: „Ваш простор: 20 GB · Искористено: 13,2 GB / 20 GB“, лента со Фотографии / Видеа / Останато, CTA „Активирајте дополнителен пакет за повеќе простор“ (линк до `/couple/packages` од Сесија 1). Retention: по `photo_retention_days` по настанот → известување до парот (email ако има) 5 дена пред, потоа бришење преку cron + cleanup queue. Документирај во RETENTION.md.
7. **Видео честитки (C7):** зад entitlement `video_greetings` (ако нема gate уште — вклучено): ≤ 30 s, ≤ 100 MB, `<input type="file" accept="video/*" capture="user">`; без серверска транскодирање засега (забелешка во DECISIONS: 720p компресија подоцна).
8. **C8 лого watermark, C9 фото студио:** не градиш — ставки во DECISIONS.md како „подоцна“.

## Дел Б — Responsive и квалитет
9. **Мобилна навигација (D1):** под 900px — горна лента со hamburger → drawer (focus trap, Esc, aria-expanded) за venue и couple shell; табелите во хоризонтален скрол контејнер или картички; форми во една колона; уредувачот на распоред — копчиња за zoom +/−, pinch (координирај со Сесија 3: ти shell/CSS, тие canvas). Тест: Playwright со viewport 390×844 за главните страници (нема хоризонтален скрол на `body`).
10. **A11Y (D2):** `lang="mk"` во `app/layout.tsx`, labels на сите полиња, контраст на muted боја — по `A11Y.md`; axe во e2e премини од report-only во fail за нови страници.
11. **Placeholders (D3):** кај парот „Пораки“ — скриј од nav. Проверка: во nav нема `ready:false` ставки (тест).

## Дел В — Лансирање (на крај)
12. **SETUP/release (D4):** поправи `docs/production/SETUP.md` (бројот на миграции, Next 16, регион eu-west-1), додај нови env (CRON_SECRET за reminders ако Сесија 2 го бара, album), напиши `docs/production/LAUNCH.md`: редослед на спојување на 4-те branch-ови, полн тест run, `db push` на prod (го прави сопственикот), smoke тест на телефон (покана → RSVP → „Каде седам?“ → upload фото), rollback.
13. Финален **полн run** по спојувањето: `supabase db reset --local` → сите миграции 0001–0089, `typecheck`, `lint`, `test:unit`, `test:db`, `playwright`, `build`, `npm audit` — извештај до корисникот.

## Не е твое
Admin/entitlements (Сесија 1 — ти само го читаш `storage_gb`/`video_greetings`/`photo_retention_days` ако постојат), RSVP (Сесија 2), распоред (Сесија 3). Ти си сопственик на shell компонентите и `panel.css` — другите смеат само да менуваат ставки во nav низите.

## Прифаќање
- Гостин од телефон: скенира → прикачува 10 фото → остава честитка; парот ги гледа, скрива, презема ZIP.
- Квотата го одбива upload-от над лимитот; приказот на простор е точен.
- Сите панели употребливи на 390px; нема „Наскоро“ во nav; a11y проверки зелени.
- `LAUNCH.md` и ажуриран `SETUP.md`; финален run зелен.

## Старт (залепи во нова Claude сесија)
> Ти си Сесија 4. Прочитај `docs/MASTER.md` и `docs/sessions/SESSION-4-media-launch.md`. Работи на branch `s4-media-launch`. Прво краток план (superpowers:writing-plans) за Дел А и Б, покажи ми го, па изврши со TDD; Дел В на крај кога другите сесии ќе завршат. Не комитирај — по секоја задача дај ми git команди без co-author.
