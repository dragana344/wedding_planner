# Production setup — checklist

Сè што треба да се направи **надвор од кодот** за апликацијата да оди во production.
Редоследот е важен: секој чекор зависи од претходните.

Легенда:
- 🧑 = ти го правиш (dashboard / плаќање / DNS)
- 🔌 = поврзување за Claude (CLI login или MCP connector)
- 📤 = ми праќаш во чат (само **не-тајни** вредности)
- 🔒 = тајна: **никогаш во чат, никогаш во git.** Само во Vercel env или во локален `.env.production.local`

---

## 0. Поврзи ме со алатките (🔌)

Без ова можам само да пишувам код. Со ова можам сам да пуштам миграции, да поставам env vars, да проверам deploy и логови.

### 0.1 CLI логини (во терминал, еднаш)

- [ ] **Supabase CLI**: `npx supabase login`. Отвора browser; ако не отвори, копирај го access token-от од https://supabase.com/dashboard/account/tokens
- [ ] **Vercel CLI**: `npm i -g vercel@latest`, потоа `vercel login` (сега е 59.5.0 и тековниот token не важи)
- [ ] **Cloudflare (R2)**: `npm i -g wrangler`, потоа `wrangler login`
- [ ] **GitHub**: `gh auth status`. Сега си логиран како `godevlabproduction`, а repo-то е `dragana344/wedding_planner`. Или додај го `godevlabproduction` како collaborator (Admin, за branch protection и secrets), или префрли го repo-то во org на GoDevLab.

### 0.2 MCP connectors во Claude Code

Во интерактивна Claude Code сесија напиши `/mcp` и авторизирај ги:

- [ ] `plugin:supabase:supabase`: SQL, миграции, advisors, логови на прод проектот
- [ ] `plugin:vercel:vercel`: deployments, env, логови
- [ ] `plugin:cloudflare:cloudflare-bindings`: R2 bucket-и
- [ ] `plugin:cloudflare:cloudflare-api`: по желба, за DNS ако доменот е на Cloudflare
- [ ] `plugin:cloudflare:cloudflare-observability`: по желба

> При авторизација на Supabase MCP избери **само прод организацијата/проектот**. Ако сакаш да бидеш посигурен, дај ми read-only пристап. Тогаш миграции пуштаме преку CLI или CI, кога ти ќе потврдиш.

---

## 1. Supabase — прод проект

### 1.1 Креирање

- [ ] 🧑 Нов **Organization** или користи постоечка, план **Pro** (backups, поголеми upload лимити, custom SMTP)
- [ ] 🧑 Нов проект: име `wedding-planner-prod`, регион **EU (Frankfurt `eu-central-1`)**
- [ ] 🔒 **Database password**: генерирај силна, чувај ја во password manager. Ќе треба за `supabase link` и `db push`
- [ ] 📤 Прати ми: **Project ref** (20 знаци од URL-то, `https://<ref>.supabase.co`) и регионот

### 1.2 API клучеви — кои да ги земеш

Settings → **API Keys**. Supabase сега има два сета:

| Нов (препорачано) | Legacy (JWT) | Каде оди кај нас | Тајна? |
|---|---|---|---|
| **Publishable key** `sb_publishable_...` | `anon` key `eyJ...` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Не, оди во browser |
| **Secret key** `sb_secret_...` | `service_role` key `eyJ...` | `SUPABASE_SERVICE_ROLE_KEY` | 🔒 **ДА**, заобиколува RLS |
| — | — | `NEXT_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co` | Не |

- [ ] 🧑 Земи ги **новите** клучеви (publishable + secret). `@supabase/supabase-js` 2.112 и `@supabase/ssr` 0.12 ги поддржуваат без промена во кодот. Имињата на env променливите остануваат исти.
- [ ] 🧑 Кога прод ќе работи на новите клучеви: Settings → API Keys → **Disable legacy API keys**. Така стариот `service_role` JWT никогаш не може да протече.
- [ ] 🔒 Secret key-от **не го праќај во чат**. Го внесуваш директно во Vercel (чекор 3.3).
- [ ] 📤 Publishable key-от и URL-то смееш да ми ги пратиш, јавни се.

> Зошто новите: secret key-от може да се ротира без да се сменат сите JWT-а и Supabase го одбива ако дојде од browser. Legacy `service_role` е JWT што важи до 2030+ и не може да се поништи без да се ротира JWT secret-от на целиот проект.

### 1.3 Миграции

- [ ] 🔌 `npx supabase link --project-ref <ref>` (бара DB password; внеси ја ти во терминалот)
- [ ] 🔌 `npx supabase db push`: ги пушта сите 30 миграции (`supabase/migrations/0001` до `0030`)
- [ ] Провери: Dashboard → Table Editor ги има `venues`, `events`, `guests`...; Storage ги има bucket-ите `menu-item-photos`, `event-showcase-photos`, `invitation-photos`
- [ ] Dashboard → **Advisors** (Security + Performance): прати ми screenshot или листа ако има предупредувања

### 1.4 Auth поставки (Authentication → URL Configuration)

Треба прво доменот (чекор 2). Дотогаш користи Vercel URL-то.

- [ ] **Site URL**: `https://<tvojdomen>`. Важно: reset мејлот слета на root-от, а `RecoveryRedirect` пренасочува на `/reset-password`
- [ ] **Redirect URLs**:
  - `https://<tvojdomen>/**`
  - `https://<tvojdomen>/reset-password`
  - `https://*-<vercel-team>.vercel.app/**` (preview deployments)
  - `https://admin.<tvojdomen>/**` (админ поддомен, чекор 3.2.1 — `docs/production/ADMIN.md`)
- [ ] **Email → Confirm email**: одлука ⚑ (SEC-012). Локално е исклучено. Препорака за прод: **вклучено**, за да не се регистрира сала со туѓ мејл
- [ ] **Minimum password length**: 10+; **Leaked password protection**: ON (Pro)
- [ ] **Rate limits**: провери ги default вредностите за sign-up, reset и OTP

### 1.5 Backups

- [ ] 🧑 Database → Backups: daily backups се вклучени на Pro. **PITR** (+$) по желба
- [ ] Storage фајловите **не** се во овие backup-и, затоа постои чекор 5 (R2)

---

## 2. Домен

- [ ] 🧑 Купи домен (пр. `.mk` преку MARnet регистрар, или `.com`)
- [ ] 🧑 Одлучи каде е DNS-от. Препорака: **Cloudflare DNS** (бесплатно, и R2 и Turnstile се веќе таму)
- [ ] 📤 Прати ми: доменот и дали е `www.` или без (канонски host)

---

## 3. Vercel

### 3.1 Проект

- [ ] 🧑 План **Pro**. Hobby не дозволува комерцијална употреба
- [ ] 🔌 `vercel link` во root на repo-то, или Import од GitHub во dashboard
- [ ] 🧑 Settings → Git: Production branch = `main`
- [ ] 🧑 Settings → Functions → **Region: `dub1` (Dublin)**, до Supabase (`eu-west-1`)
- [ ] 🧑 Settings → General → Node.js version: **22.x**

### 3.2 Домен

- [ ] 🧑 Settings → Domains → додај `<tvojdomen>` и `www.<tvojdomen>`; едниот redirect кон другиот
- [ ] 🧑 Внеси ги DNS записите што ги дава Vercel (A / CNAME). TLS е автоматски
- [ ] Врати се на чекор 1.4 и стави го вистинскиот Site URL

### 3.2.1 Админ поддомен (`admin.<tvojdomen>`)

Админ панелот (`app/admin/**`) не е посебен Vercel проект — истата апликација, рутирана по host (`proxy.ts`). Само уште еден домен на истиот проект:

- [ ] 🧑 Settings → Domains → додај `admin.<tvojdomen>` (истиот проект; **не** ново `vercel link`)
- [ ] 🧑 Внеси го DNS записот што го дава Vercel за `admin` (обично `CNAME admin → cname.vercel-dns.com`) — доменот и `www` од 3.2 не го покриваат ова поддоменско име автоматски
- [ ] Врати се на чекор 1.4 и додади `https://admin.<tvojdomen>/**` во Redirect URLs (потребно за TOTP recovery/reset-link флоу на админ сметките)
- [ ] ✅ Тест: `https://admin.<tvojdomen>/login` враќа login екран (не 404); `https://<tvojdomen>/admin` враќа 404 (главниот домен никогаш не го служи админ панелот)
- [ ] Прво создај го првиот админ: `node --env-file=<prod env> scripts/make-admin.mjs <твојот мејл>` (детали и mandatory TOTP во `docs/production/ADMIN.md`)

### 3.3 Environment variables

Settings → Environment Variables. **Production** и **Preview** се посебни.

| Име | Production | Preview | Sensitive |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | прод URL | staging URL* | не |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | прод publishable | staging publishable* | не |
| `SUPABASE_SERVICE_ROLE_KEY` | прод secret | staging secret* | ✅ **Sensitive** |

\* **Preview никогаш не смее да покажува кон прод базата** (DATA-010). Или направи втор мал Supabase проект `wedding-planner-staging` (Free е доволен), или исклучи preview deployments додека не се направи.

- [ ] 🧑 Внеси ги трите за Production, а `SUPABASE_SERVICE_ROLE_KEY` означи го како **Sensitive**
- [ ] 🧑 Staging Supabase проект + Preview env vars (или preview исклучен)
- [ ] 🔌 Кога ќе завршиш, кажи ми и ќе проверам со `vercel env ls` дека се сите тука (вредностите не ги гледам)

---

## 4. Email — Resend

- [ ] 🧑 Сметка на https://resend.com
- [ ] 🧑 Domains → Add → **поддомен** `mail.<tvojdomen>` (така главниот домен не губи репутација)
- [ ] 🧑 Внеси ги DNS записите што ги дава Resend: **SPF** (TXT), **DKIM** (TXT/CNAME), **MX** за bounce; чекај статус *Verified*
- [ ] 🧑 Додај **DMARC** на главниот домен: TXT `_dmarc.<tvojdomen>` = `v=DMARC1; p=none; rua=mailto:dmarc@<tvojdomen>`. По 2–4 недели смени на `p=quarantine`
- [ ] 🧑 API Keys → нов клуч, **Sending access**, само за тој домен
- [ ] 🧑 Supabase → Authentication → **SMTP Settings** → Enable custom SMTP:
  - Host `smtp.resend.com`, Port `465`, User `resend`, Password = 🔒 Resend API key
  - Sender: `no-reply@mail.<tvojdomen>`, име на продуктот
- [ ] 🧑 Supabase → Auth → Rate Limits → *emails per hour*: подигни (пр. 100)
- [ ] ✅ Тест: „Заборавена лозинка“ на `/login` → мејлот стига → линкот носи на `/reset-password` → новата лозинка работи
- [ ] 📤 Кажи ми: на која адреса да стигнуваат пораките од контакт формата (OBS-005)

Подоцна (INFRA-008): email templates на македонски во Supabase → Auth → Email Templates. Јас ќе ги напишам текстовите.

---

## 5. Cloudflare R2 — off-site backup

Апликацијата **не** користи R2 за слики, тие се во Supabase Storage. R2 служи само за backup (DATA-001).

- [ ] 🧑 Cloudflare → R2 → Enable (бара картичка; 10 GB бесплатно)
- [ ] 🧑 Create bucket `wedding-planner-backups`, локација **EU**, **без** public access
- [ ] 🧑 Bucket → Settings → **Object lifecycle**: бриши објекти постари од 35 дена
- [ ] 🧑 R2 → Manage API Tokens → Create: **Object Read & Write**, **само за овој bucket**
- [ ] 🔒 Ќе добиеш `Access Key ID`, `Secret Access Key` и endpoint `https://<account_id>.r2.cloudflarestorage.com`. Тие одат во **GitHub Actions secrets** (чекор 7), не во Vercel
- [ ] 📤 Прати ми: account ID и името на bucket-от (не се тајни)

---

## 6. Sentry — error tracking

- [ ] 🧑 https://sentry.io → нов проект **Next.js**, регион на податоци **EU** (`de.sentry.io`)
- [ ] 📤 Прати ми: **DSN** (јавен е, оди во browser), org slug, project slug
- [ ] 🧑 Settings → Auth Tokens → org token со `project:releases` + `org:read`
- [ ] 🔒 `SENTRY_AUTH_TOKEN` → Vercel env (Production + Preview, Sensitive). Служи за source maps
- [ ] 🧑 Alerts → кој прима мејл при нова грешка

---

## 7. GitHub — CI и secrets

- [ ] 🧑 Пристап до repo-то (види 0.1)
- [ ] 🧑 Settings → Secrets and variables → Actions → додај:

| Secret | Од каде | За што |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` 🔒 | supabase.com/dashboard/account/tokens | миграции од CI |
| `SUPABASE_DB_PASSWORD` 🔒 | чекор 1.1 | `db push` / `pg_dump` |
| `SUPABASE_PROJECT_REF` | чекор 1.1 | |
| `R2_ACCESS_KEY_ID` 🔒 | чекор 5 | backup |
| `R2_SECRET_ACCESS_KEY` 🔒 | чекор 5 | backup |
| `R2_ENDPOINT` | чекор 5 | backup |
| `R2_BUCKET` | чекор 5 | backup |

- [ ] 🧑 Settings → Environments → `production` со **Required reviewer** (ти). Така миграциите на прод чекаат твое одобрување
- [ ] Branch protection на `main`: ќе ја поставам јас (CICD-006) кога CI ќе постои

---

## 8. Rate limiting

Не треба ништо: лимитите се чуваат во Postgres (миграција 0037), без Upstash.

---

## 9. Monitoring

- [ ] 🧑 UptimeRobot или Better Stack (бесплатен план): монитор на `https://<tvojdomen>/api/health` (endpoint-от го правам јас, REL-001), интервал 5 мин
- [ ] 📤 Кажи ми: **кој прима аларми** (мејл/телефон)

---

## 10. Правни документи

- [ ] Privacy policy + Terms, МК и EN (COMP-001). Нацртот го пишувам јас, а ти ги потврдуваш податоците за фирмата:
  - 📤 Правно име на фирмата, адреса, ЕМБС, контакт мејл за приватност
- [ ] DPA договор со салите (COMP-005)
- [ ] Препорака: еднократен преглед од вистински правник, бидејќи чуваме податоци за гости

---

## 11. Отворени одлуки (одговори ми)

- [ ] Supabase Pro + Vercel Pro: одобрено?
- [ ] Next.js 14 → 16 upgrade сега? (1 critical + 1 high ранливост, SEC-024)
- [ ] Email confirmation при регистрација на сала: да/не?
- [ ] Колку долго се чуваат податоците за гостите по свадбата?
- [ ] При бришење на сметка на сала, дали нешто останува (анонимизирани финансии)?
- [ ] Дали гостин може да го смени својот RSVP одговор преку јавниот линк?
- [ ] Дали парот се одјавува кога салата ќе му регенерира лозинка?

---

## Резиме: што ми треба од тебе

**Поврзување** (🔌): `supabase login`, `vercel login`, `wrangler login`, GitHub пристап до repo-то, `/mcp` авторизација за Supabase, Vercel и Cloudflare.

**Вредности во чат** (📤, не се тајни):
- Supabase project ref + регион, publishable key
- Домен + канонски host
- R2 account ID + bucket име
- Sentry DSN, org и project slug
- Мејл за контакт форма и за аларми
- Податоци за фирмата за правните текстови
- Одговори на одлуките од чекор 11

**Никогаш во чат** (🔒, ги внесуваш ти директно во Vercel / GitHub / Supabase):
- Supabase secret key (или `service_role`), DB password, access token
- Resend API key
- R2 Access Key ID + Secret
- Sentry auth token
