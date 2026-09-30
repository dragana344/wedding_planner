# Лансирање — runbook за go-live

Точен редослед за пуштање во production. Секој чекор зависи од претходните. Нема тајни во овој документ: каде пишува `<…>`, внеси ја вредноста ти, во терминал или dashboard, никогаш во чат или git.

Позадина и објаснувања: `SETUP.md` (сметки, клучеви, env), `DEPLOY.md` (pipeline, rollback), `MIGRATIONS.md`, `ADMIN.md`, `AUTH.md`, `EMAIL.md`, `RETENTION.md`, `MONITORING.md`.

Фиксни вредности: Supabase проект **`kade-sum`**, ref `vltzigldrqcvkxwylzbx`, регион `eu-west-1`. Vercel проект `wedding-planner`, регион `dub1`.

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH   # Node 22
cd ~/Desktop/wedding_planner
```

---

## 0. Пред-проверка (ден пред)

- [ ] Кодот е на `main` (branch `launch-prep` споен со fast-forward) и CI на `main` е зелен
- [ ] Локално, финалниот run е зелен: `npm run typecheck && npm run lint && npm run test:unit:coverage && npm run test:db:coverage && npm run build && npx playwright test`
- [ ] **Одлука: Supabase Pro + Vercel Pro** (DECISIONS.md Open 1). Без Vercel Pro: забранета комерцијална употреба и cron-овите одат само еднаш дневно. Без Supabase Pro: нема daily backups, ни leaked password protection
- [ ] **Backup пред првиот push:** Supabase → Database → Backups: провери дека има бекап од денес (Pro). Дополнително рачна копија од шемата и податоците:
  ```bash
  npx supabase link --project-ref vltzigldrqcvkxwylzbx
  npx supabase db dump --linked -f ~/kadesum-pre-launch-schema.sql
  npx supabase db dump --linked --data-only -f ~/kadesum-pre-launch-data.sql
  ```
  Фајловите чувај ги локално/шифрирано, **не** во repo-то (содржат лични податоци)
- [ ] Доменот е купен и DNS-от е достапен (SETUP.md §2); Resend домен *Verified* (SETUP.md §4)

## 1. Одлуки што се уште се отворени

Од `DECISIONS.md` → „Open — owner decisions“. Не блокираат лансирање, освен каде пишува:

- [ ] 1 — Supabase Pro + Vercel Pro (**блокира**)
- [ ] 2 — Периоди за чување на лични податоци (12 / 24 месеци?) и албуми по пакет (15/30/40/60 дена). Додека не одобриш: `MEDIA_RETENTION_ENABLED` останува **неповставен**
- [ ] 3 — Бришење на сметка: дали нешто останува (анонимизирани финансии)?
- [ ] 4 — Staging Supabase проект (Preview да не гаѓа прод)
- [ ] 5 — MFA задолжително за персонал?
- [ ] 6 — Правни податоци за фирмата во privacy/terms/DPA (**блокира** јавно лансирање со вистински гости)
- [ ] 7 — Сметки: домен, Resend, Sentry, R2, uptime
- [ ] 8 — On-call: имиња и контакти во `INCIDENTS.md`
- [ ] 10 — A11Y поправки (A11Y.md)
- [ ] Бренд/домен (MASTER §4F): КАДЕ СУМ? / kadesum.mk или К@де си? / kadesi.mk

## 2. База (Supabase `kade-sum`)

Миграциите се 68 фајлови, `0001`–`0084`, со празнини. **Внимание:** 0047–0053 (admin/пакети) се споени по 0060–0077, па ако прод веќе има повисока миграција од некоја што недостасува, обичниот `db push` одбива. Затоа `--include-all`.

- [ ] Поврзи и види што е применето:
  ```bash
  npx supabase login
  npx supabase link --project-ref vltzigldrqcvkxwylzbx
  npx supabase migration list --linked
  ```
  Колоната *Remote* е состојбата на прод. Ако има Remote без Local → **стоп** (некој менувал во dashboard; види MIGRATIONS.md).
- [ ] Преглед без промени:
  ```bash
  npx supabase db push --linked --include-all --dry-run
  ```
- [ ] Примени:
  ```bash
  npx supabase db push --linked --include-all
  ```
  `--include-all` ги пушта и миграциите со понизок број од последната применета. После ова, `deploy.yml` (без `--include-all`) работи нормално.
- [ ] Провери:
  ```bash
  npx supabase migration list --linked              # секоја Local има Remote, до 0084
  npx supabase db diff --linked --schema public     # празно = нема drift
  ```
- [ ] Storage → bucket-и (ги креираат миграциите, не рачно): `menu-item-photos`, `event-showcase-photos`, `invitation-photos` (јавни); `event-media`, `event-media-uploads` (**приватни**). Ако `event-media*` е означен како public → стоп и јави ми.
- [ ] Database → Advisors (Security + Performance): нема црвени ставки
- [ ] Table Editor → `plans`: 5 пакети (`Стандарден` default, START, PREMIUM, PREMIUM+, ULTRA). **Провери `photo_retention_days`** на секој пакет пред retention да се вклучи (§9)

## 3. Auth (Supabase → Authentication)

Детали: `AUTH.md`, `EMAIL.md`.

- [ ] URL Configuration → **Site URL**: `https://<domain>`
- [ ] URL Configuration → **Redirect URLs**:
  - `https://<domain>/**`
  - `https://<domain>/reset-password`
  - `https://admin.<domain>/**`
  - `https://admin.<domain>/reset-password`
  - (preview, ако има staging) `https://*-godevlab-productions-projects.vercel.app/**`
- [ ] Emails → **SMTP** преку Resend: host `smtp.resend.com`, port `465`, user `resend`, password = посебниот `supabase-smtp` клуч, sender `no-reply@mail.<domain>`, име `КАДЕ СУМ?`
- [ ] Emails → **Templates**: Confirm signup, Reset password, Change email — HTML од `supabase/templates/`, subject од `supabase/config.toml`
- [ ] Rate Limits → emails per hour: **100**
- [ ] Sign In / Providers → Email: Confirm email **On**, Secure password change **On**, Min length **10**, Leaked password protection **On** (Pro)
- [ ] Multi-Factor → **TOTP** enroll + verify: **enabled** (задолжително за админ)

## 4. Vercel

- [ ] Settings → General → Node.js **22.x**; Functions → Region **`dub1`** (веќе во `vercel.json`)
- [ ] Settings → Git: repo поврзан; Production branch `main` (auto-deploy од `main` е исклучен во `vercel.json`, прод оди само преку `deploy.yml`)
- [ ] Settings → **Domains** (истиот проект):
  - `<domain>` (канонски) и `www.<domain>` → 308 redirect кон канонскиот
  - `admin.<domain>` — трет домен, **без** redirect, не нов проект
  - DNS: записите што ги покажува Vercel (apex `A`, `www` и `admin` `CNAME cname.vercel-dns.com`); на Cloudflare „DNS only“
- [ ] Settings → **Environment Variables** — Production (целата табела во SETUP.md §3.3):
  - задолжителни: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Sensitive), `NEXT_PUBLIC_SITE_URL=https://<domain>`, `CRON_SECRET` (Sensitive, `openssl rand -hex 32`)
  - мејл: `RESEND_API_KEY` (Sensitive), `EMAIL_FROM`, `CONTACT_NOTIFY_EMAIL`, `SUPPORT_EMAIL`, `SECURITY_CONTACT_EMAIL`
  - Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (Sensitive)
  - `IP_PSEUDONYM_SECRET` (Sensitive), `MAINTENANCE_BYPASS_TOKEN` (Sensitive)
  - **не** поставувај: `MAINTENANCE_MODE`, `MEDIA_RETENTION_ENABLED`, `MEDIA_RETENTION_DAYS` (стар, избриши ако постои)
- [ ] Preview env: staging вредности, или preview исклучен (никогаш прод клучеви во Preview)
- [ ] Провери: `vercel env ls production`
- [ ] GitHub → Environments → `production` (required reviewer = ти) со secrets/variables од `DEPLOY.md` (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`, `SUPABASE_PROJECT_REF`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `PRODUCTION_URL`) + R2 secrets за `backup.yml`
- [ ] Deploy: push на `main` → CI → `deploy.yml` (одобри го `production` job-от). Ако pipeline-от уште не е поставен: `vercel deploy --prod`
- [ ] `curl -s https://<domain>/api/health` → `"ok":true` и release = последниот commit
- [ ] Settings → **Cron Jobs**: `/api/cron/storage-cleanup` (`23 * * * *`) и `/api/cron/reminders` (`7 * * * *`). Кликни „Run“ на секоја → Logs: 200, не 401

## 5. Прв админ

- [ ] Направи локален фајл со прод вредностите (**не** во repo, `.env*` е во `.gitignore`), пр. `~/kadesum-prod.env` со `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`
- [ ] ```bash
  node --env-file=$HOME/kadesum-prod.env scripts/make-admin.mjs <твој-админ-мејл>
  ```
  Користи мејл што **не** е персонал на сала (скриптата одбива). Стига мејл за поставување лозинка
- [ ] `https://admin.<domain>/login` → лозинка → задолжителен TOTP (QR во authenticator) → повторно најава со код → админ табла
- [ ] Избриши го `~/kadesum-prod.env` (или чувај го во password manager)
- [ ] `https://<domain>/admin` → **404** (главниот домен никогаш не го служи админот)

## 6. Демо сала „Kade Sum“

- [ ] Демо сметката `kadesum@leonalux.com` → сала „Kade Sum“ има стар lock code `0000` за уредувачот на распоред (DECISIONS.md, SEC-010). Venue → Поставки → смени го на нов код, или избриши ја демо салата пред вистински клиенти
- [ ] Демо податоците (измислени гости) не мешај ги со вистински; за пилот клиентите (Leona Lux, Diamond) — нови сметки

## 7. Smoke тест (на вистински телефон, мобилни податоци, не Wi-Fi)

Направи тест настан во демо салата со твој мејл за парот.

- [ ] **Сала:** најава на `https://<domain>/login` → нов настан (сала, датум, мејл + телефон на парот) → креденцијали за парот
- [ ] **Пар:** `/couple` најава → додај 2 гости → покана (шаблон, фото) → испрати еден линк преку WhatsApp/Viber на твој телефон
- [ ] **Гостин (телефон):** отвори го персоналниот линк → поканата се гледа добро на 390px → **RSVP** „Да“ со мени и коментар → промени на „Ќе одговорам подоцна“ → парот гледа промена (и мејл за промена, ако Resend е вклучен)
- [ ] **Распоред:** сала/пар го седнува гостинот на маса → на телефонот „**Каде седам?**“ со името → маса и столче
- [ ] **Албум:** пар → Албум → QR → скенирај со телефонот → `/e/<token>` → прикачи 3 фотографии (со согласност) → остави **честитка** (име, презиме, порака) → парот ги гледа, скрива една, „Преземи ги сите“ (ZIP се отвора)
- [ ] **Мејл:** „Заборавена лозинка“ за персонал → мејлот стига (не во spam) → `/reset-password` работи
- [ ] **Админ:** `admin.<domain>` најава со TOTP → Настани → тест настанот → override: исклучи `guest_greetings` → на телефонот, честитката се одбива / картичката „не е вклучено“; повик од парот на заклучена функција враќа **403** „Оваа функција не е вклучена во вашиот пакет.“ → врати го override-от
- [ ] **Одржување:** админ → Систем → вклучи maintenance → во **30 s** `https://<domain>` дава 503 страница (не-админ прелистувач); `https://<domain>/?maintenance_bypass=<token>` те пушта → исклучи → во 30 s страницата пак работи; `/api/health` цело време го покажува вистинскиот статус
- [ ] По тестот: избриши го тест настанот (или „Избриши ги личните податоци“)

## 8. Мониторинг

- [ ] Sentry: предизвикај грешка на preview/staging или провери дека Issues прима настани; Alerts → мејл до on-call (SETUP.md §6)
- [ ] Uptime (UptimeRobot / Better Stack): keyword монитор `https://<domain>/api/health` содржи `"ok":true`, 1–5 мин, аларм по 2 пада; втор на `https://<domain>/` (MONITORING.md)
- [ ] GitHub notifications за failed workflows вклучени (`backup.yml`, `release-check.yml`)
- [ ] Првата ноќ: `backup.yml` успешен, архивата е во R2
- [ ] Vercel/Supabase usage alerts (QUOTAS.md)

## 9. Rollback

Детали: `DEPLOY.md` „Rollback runbook“.

- **Апликација (обично доволно, ~1 мин):** Vercel → Deployments → последниот добар production → ⋯ → **Instant Rollback** (или `vercel rollback <deployment-url>`). Провери `/api/health` → стариот release. Безбедно, бидејќи миграциите се expand/contract.
- **База: само forward-fix.** Никогаш „down“ миграција или рачна промена во dashboard. Нова миграција што ја поништува промената → локално од нула (`npx supabase db reset --local && npm run test:db`) → merge → pipeline.
- **Податоци (последна опција):** Supabase backup/PITR, R2 за фајлови (`BACKUPS.md`). Одлучи заедно со засегнатите сали.
- **Итно гаснење:** админ → Систем → maintenance (30 s), или `MAINTENANCE_MODE=1` во Vercel + redeploy.

## 10. По лансирањето

- [ ] Кога ќе ги одобриш периодите за албумите и ќе ги провериш `photo_retention_days` на сите пакети (посебно `Стандарден` = 15 дена) и privacy текстот ги наведува истите бројки: Vercel → `MEDIA_RETENTION_ENABLED=true` → redeploy. Првите денови следи ги логовите `media_retention_*` (RETENTION.md)
- [ ] Retention на лични податоци (12/24 месеци): по одобрување, нова миграција со `cron.schedule` (RETENTION.md §3)
- [ ] Coverage floors (`vitest.config.ts`, `vitest.db.config.ts`) **само нагоре**: кога покриеноста ќе порасне, подигни ги на новата измерена вредност (DECISIONS.md „Coverage floors“)
- [ ] Branch protection на `main` (DEPLOY.md, CICD-006)
- [ ] Staging проект и rollback проба (DEPLOY.md „Rehearsal log“)
- [ ] По 2–4 недели: DMARC `p=quarantine`
