# Сесија 4 — Медиуми и responsive (Дел А и Б) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Гостите преку QR прикачуваат фотографии и оставаат честитки (со опционално видео), парот ги гледа, модерира и презема како ZIP, просторот е видлив и ограничен, а venue и couple панелите се употребливи на 390px.

**Architecture:** Нов приватен bucket `event-media` и три табели (`event_albums`, `event_photos`, `event_greetings`) достапни само за service role. Гостинската страна `/e/<token>` прикачува директно во Storage преку потпишан URL. Потоа следува confirm со magic-byte проверка, вистинска големина од `Content-Range` и проверка на квота. Бришењето и чувањето на фајловите одат преку постојната cleanup queue (0038). Мобилната навигација е еден hook (`useDrawer`) што го користат двата shell-а, плус CSS во `panel.css`.

**Tech Stack:** Next.js 16.3 App Router, React 19, Supabase (Postgres, RLS, Storage), zod 4, vitest 5 (unit + db), Playwright, `qrcode`, Node 22 `zlib.crc32` за ZIP.

**Spec:** `docs/MASTER.md` (дел 2, 4-C, 4-D, 7) + `docs/sessions/SESSION-4-media-launch.md` (Дел А и Б). Дел В (SETUP/LAUNCH, финален run) не е во овој план; тој е на крај, кога другите сесии ќе завршат.

## Global Constraints

- Node 22: `export PATH=/opt/homebrew/opt/node@22/bin:$PATH` пред секоја npm/npx команда.
- Миграции само во опсегот `0080`–`0089`. Постоечка миграција не се менува. Без `supabase db reset` (другите сесии ја користат локалната база); применувај со `npx supabase migration up --local`.
- Тестовите никогаш не одат на Cloud: пред DB тестови `node scripts/write-test-env.mjs`.
- Нова табела: `enable row level security` + `revoke all … from anon, authenticated` + експлицитен grant. Нова функција: `revoke all … from public`. `security definer` секогаш со `set search_path = public, extensions, pg_temp`. Секоја нова табела во `tests/supabase/rls_guard.test.ts`, секоја колона во `tests/supabase/privacy-classification.ts`.
- API рути: `withPublic` / `withCoupleEvent`, zod шеми, само намерни пораки кон корисникот (`throw new Error("…")` на македонски).
- UI текст на македонски. Гостинските страни се mobile-first, со крем `#F5EFE4` и злато `#B8913A`.
- Лимити: фото ≤ 15 MB по фајл, видео ≤ 100 MB и ≤ 30 s, компресија во прелистувач до 2560 px JPEG, стандардна квота 5 GB по настан (или `storage_gb` кога Сесија 1 ќе го додаде).
- Claude не извршува ниту една git команда што менува состојба. По секоја задача корисникот добива `git add … && git commit -m "…"`, без Co-Authored-By.
- Туѓи фајлови: `proxy.ts` и `lib/entitlements/*` (Сесија 1), `components/invite/**` и `lib/couple/guests.ts` (Сесија 2) и floor-plan canvas (Сесија 3) не се менуваат. За нив оставам белешка во Hub.
- Гејт пред секој „commit“: `npm run typecheck && npm run lint && npm run test:unit`, плюс DB тестовите на задачата.

## Отстапувања од брифот (за твоја потврда)

1. **Staff read на медиумите:** брифот вели „staff read на својата сала“. Ниеден venue екран не ги прикажува, па табелите се само за service role (најмал привилегиран пристап). Ако подоцна треба, се додава policy во нова миграција.
2. **Токен за албумот** е во посебна табела `event_albums`, а не колона во `events`. Со тоа `events` останува недопрена за другите сесии, а бришењето на личните податоци го брише и токенот.
3. **Бришење на лични податоци:** наместо `create or replace` на `erase_event_personal_data` (ризик да се поништи измена од друга сесија), trigger на `events.personal_data_erased_at` ги брише медиумите.
4. **Retention (C6)** е изграден, но **исклучен** додека не се постави `MEDIA_RETENTION_DAYS`. Периодите се одлука на сопственикот (RETENTION.md). Бројот на денови по настан подоцна ќе го даде entitlement `photo_retention_days`.
5. **Zoom +/− и pinch** на уредувачот на распоред припаѓа на Сесија 3 (canvas). Јас го правам само контејнерот (CSS со скрол и `touch-action`) и оставам белешка во Hub.
6. **iPhone видео:** покрај MP4 и WebM прифаќам и MOV (`video/quicktime`), бидејќи Safari снима MOV.

## Review Focus

1. **Гостин прикачува HEIC од Android/Chrome** (прелистувачот не може да го декодира): очекувано е јасна порака „Оваа фотографија не може да се обработи…“, без тивко губење. Тест: во Task 6, `compressImage` одбива со `PhotoProcessError` кога декодирањето не успее.
2. **Два гостина истовремено ја преминуваат квотата:** confirm ја проверува квотата со вистинските бајти и го брише фајлот ако е над лимитот. Тест: во Task 3, „confirm над квота го брише објектот и не прави ред“.
3. **Токенот на албумот по бришење на личните податоци:** `/e/<стар токен>` враќа 404, а не празен албум. Тест: во Task 1, по erasure нема ред во `event_albums`.
4. **Голем албум (> 2 GB) за ZIP:** се дели на делови, секој ≤ 1,5 GB и ≤ 400 фајлови (без ZIP64). Тест: во Task 2, `planZipParts`.
5. **Прикачувачот го затвора табот по upload, пред confirm:** објектот под `pending/` се брише по 24 h. Тест: во Task 3, `sweepStalePendingMedia` бриша само постари од cutoff.

---

### Task 1: Шема на медиуми (миграција 0080)

**Files:**
- Create: `supabase/migrations/0080_event_media.sql`
- Modify: `tests/supabase/rls_guard.test.ts` (SERVICE_ROLE_ONLY_TABLES + `event_albums`, `event_photos`, `event_greetings`)
- Modify: `tests/supabase/privacy-classification.ts`
- Modify: `lib/privacy/export.ts` (EXPORTED_TABLES + `event_photos`, `event_greetings`; секцијата по настан)
- Modify: `tests/supabase/privacy.test.ts` (`seedEvent` додава album/photo/greeting + фајл)
- Test: `tests/supabase/event_media.test.ts`

**Interfaces:**
- Produces: bucket `event-media` (приватен, 100 MB, mime: jpeg/png/webp/mp4/webm/quicktime). Табели:
  - `event_albums(event_id pk, public_token unique ≥22, retention_notice_sent_at, created_at)`
  - `event_photos(id, event_id, storage_path unique, bytes ≤15 MB, mime, width, height, uploader_name ≤120, consent_at not null, hidden_at, created_at)`
  - `event_greetings(id, event_id, first_name 1–60, last_name 1–60, message 1–1000, video_path, video_bytes ≤100 MB, hidden_at, created_at)`
  
  SQL `public.event_media_usage(p_event_id uuid) returns table(photo_bytes bigint, video_bytes bigint, photo_count int, greeting_count int)`, само за service_role.

- [ ] **Step 1: Failing test** `tests/supabase/event_media.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
let db: Client; let venueId: string; let eventId: string;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL }); await db.connect();
  const { data: v } = await admin.from("venues").insert({ name: "Media Venue" }).select("id").single();
  venueId = v!.id;
  const { data: e } = await admin.from("events").insert({ venue_id: venueId, couple_names: "M & M", event_date: "2027-07-01" }).select("id").single();
  eventId = e!.id;
});
afterAll(async () => { await admin.from("venues").delete().eq("id", venueId); await db.end(); });

describe("0080 event media", () => {
  it("bucket is private with the media allow-list and a 100 MB cap", async () => {
    const { rows } = await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'event-media'");
    expect(rows[0]).toEqual({ public: false, file_size_limit: "104857600", allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"] });
  });
  it("tables are closed to anon", async () => {
    for (const t of ["event_albums", "event_photos", "event_greetings"]) {
      const { error } = await anon.from(t).select("*").limit(1);
      expect(error, t).not.toBeNull();
    }
  });
  it("rejects over-limit rows", async () => {
    const big = await admin.from("event_photos").insert({ event_id: eventId, storage_path: `${eventId}/x.jpg`, bytes: 15 * 1024 * 1024 + 1, mime: "image/jpeg", consent_at: new Date().toISOString() });
    expect(big.error).not.toBeNull();
    const long = await admin.from("event_greetings").insert({ event_id: eventId, first_name: "А", last_name: "Б", message: "x".repeat(1001) });
    expect(long.error).not.toBeNull();
  });
  it("usage sums photo and video bytes", async () => {
    await admin.from("event_photos").insert({ event_id: eventId, storage_path: `${eventId}/photos/u1.jpg`, bytes: 1000, mime: "image/jpeg", consent_at: new Date().toISOString() });
    await admin.from("event_greetings").insert({ event_id: eventId, first_name: "Ана", last_name: "Петрова", message: "Честито!", video_path: `${eventId}/videos/v1.mp4`, video_bytes: 5000 });
    const { data } = await admin.rpc("event_media_usage", { p_event_id: eventId });
    expect(data[0]).toMatchObject({ photo_bytes: 1000, video_bytes: 5000, photo_count: 1, greeting_count: 1 });
  });
  it("deleting a photo or greeting queues its file", async () => {
    await admin.from("event_photos").delete().eq("storage_path", `${eventId}/photos/u1.jpg`);
    await admin.from("event_greetings").delete().eq("video_path", `${eventId}/videos/v1.mp4`);
    const { data } = await admin.from("storage_cleanup_queue").select("path").eq("bucket", "event-media").in("path", [`${eventId}/photos/u1.jpg`, `${eventId}/videos/v1.mp4`]);
    expect(data).toHaveLength(2);
  });
  it("erasing the event's personal data removes album, photos and greetings", async () => {
    await admin.from("event_albums").insert({ event_id: eventId, public_token: "t".repeat(24) });
    await admin.from("event_photos").insert({ event_id: eventId, storage_path: `${eventId}/photos/u2.jpg`, bytes: 10, mime: "image/jpeg", consent_at: new Date().toISOString() });
    await admin.rpc("erase_event_personal_data", { p_event_id: eventId });
    for (const t of ["event_albums", "event_photos", "event_greetings"]) {
      const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq("event_id", eventId);
      expect(count, t).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (нема bucket/табели):
  `node scripts/write-test-env.mjs && npx vitest run -c vitest.db.config.ts tests/supabase/event_media.test.ts`

- [ ] **Step 3: Migration** `supabase/migrations/0080_event_media.sql`:

```sql
-- 0080 (Session 4, C1–C3, C5–C7): guest photos, greetings (with optional
-- video) and the album's public token. Service role only: guests reach these
-- through /api/e/<token>, couples through /api/couple/album; nobody reads
-- them from the browser. Files live in the private event-media bucket and
-- follow their rows through the 0038 cleanup queue.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', false, 104857600,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table public.event_albums (
  event_id uuid primary key references public.events(id) on delete cascade,
  public_token text not null unique check (char_length(public_token) >= 22),
  retention_notice_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  storage_path text not null unique,
  bytes bigint not null check (bytes > 0 and bytes <= 15728640),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  width int check (width between 1 and 20000),
  height int check (height between 1 and 20000),
  uploader_name text check (char_length(uploader_name) <= 120),
  consent_at timestamptz not null,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index event_photos_event_created_idx on public.event_photos (event_id, created_at desc);

create table public.event_greetings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 60),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  video_path text unique,
  video_bytes bigint check (video_bytes > 0 and video_bytes <= 104857600),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  check ((video_path is null) = (video_bytes is null))
);
create index event_greetings_event_created_idx on public.event_greetings (event_id, created_at desc);

alter table public.event_albums enable row level security;
alter table public.event_photos enable row level security;
alter table public.event_greetings enable row level security;
revoke all on public.event_albums, public.event_photos, public.event_greetings from anon, authenticated;
grant all on public.event_albums, public.event_photos, public.event_greetings to service_role;

-- Files follow their rows (same contract as 0038's queue_photo_cleanup, but
-- these tables name the column differently).
create or replace function public.queue_event_media_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_old text;
  v_new text;
begin
  if tg_table_name = 'event_photos' then
    v_old := old.storage_path;
    v_new := case when tg_op = 'DELETE' then null else new.storage_path end;
  else
    v_old := old.video_path;
    v_new := case when tg_op = 'DELETE' then null else new.video_path end;
  end if;
  if v_old is not null and v_old is distinct from v_new then
    insert into public.storage_cleanup_queue (bucket, path) values ('event-media', v_old);
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.queue_event_media_cleanup() from public, anon, authenticated;

create trigger event_photos_queue_cleanup
  after delete or update of storage_path on public.event_photos
  for each row execute function public.queue_event_media_cleanup();
create trigger event_greetings_queue_cleanup
  after delete or update of video_path on public.event_greetings
  for each row execute function public.queue_event_media_cleanup();

-- Event erasure (0043) marks the event; the event's media go with it. A
-- trigger rather than a new erase_event_personal_data(), so parallel
-- sessions extending that function don't overwrite each other.
create or replace function public.erase_event_media()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  delete from public.event_photos where event_id = new.id;
  delete from public.event_greetings where event_id = new.id;
  delete from public.event_albums where event_id = new.id;
  insert into public.storage_cleanup_queue (bucket, path)
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id = 'event-media'
    and (o.name like new.id::text || '/%' or o.name like 'pending/' || new.id::text || '/%')
    and not exists (select 1 from public.storage_cleanup_queue q where q.bucket = o.bucket_id and q.path = o.name);
  return new;
end;
$$;
revoke all on function public.erase_event_media() from public, anon, authenticated;

create trigger events_erase_media
  after update of personal_data_erased_at on public.events
  for each row
  when (old.personal_data_erased_at is null and new.personal_data_erased_at is not null)
  execute function public.erase_event_media();

create or replace function public.event_media_usage(p_event_id uuid)
returns table (photo_bytes bigint, video_bytes bigint, photo_count int, greeting_count int)
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select
    coalesce((select sum(bytes) from event_photos where event_id = p_event_id), 0)::bigint,
    coalesce((select sum(video_bytes) from event_greetings where event_id = p_event_id), 0)::bigint,
    (select count(*) from event_photos where event_id = p_event_id)::int,
    (select count(*) from event_greetings where event_id = p_event_id)::int;
$$;
revoke all on function public.event_media_usage(uuid) from public, anon, authenticated;
grant execute on function public.event_media_usage(uuid) to service_role;
```

`delete_venue_account` (0043) брише по каскада, а тригерите за редови ги ставаат фајловите во редот. Објектите под `pending/` ги брише sweep-от по 24 h (Task 3).

- [ ] **Step 4: Guards.** Во `rls_guard.test.ts` додај трите табели во `SERVICE_ROLE_ONLY_TABLES`. Во `privacy-classification.ts`:

```ts
  event_albums: { event_id: N, public_token: S, retention_notice_sent_at: N, created_at: N },
  event_greetings: { id: N, event_id: N, first_name: P, last_name: P, message: P, video_path: P, video_bytes: N, hidden_at: N, created_at: N },
  event_photos: { id: N, event_id: N, storage_path: P, bytes: N, mime: N, width: N, height: N, uploader_name: P, consent_at: N, hidden_at: N, created_at: N },
```

Во `lib/privacy/export.ts` додај `"event_photos"` и `"event_greetings"` во `EXPORTED_TABLES`. Во блокот по настан додај `photos` (со `uploader_name`, `created_at` и потпишан URL за 7 дена) и `greetings` (сите колони освен `id`), по истиот шаблон како `showcase_photos`. Во `privacy.test.ts`, во `seedEvent`, додај ред во `event_albums`, еден `event_photos` со `put("event-media", \`${eventId}/photos/p.jpg\`)` и еден greeting. Проверката „leftovers“ тогаш сама го покрива erasure-от.

- [ ] **Step 5: Apply + run:** `npx supabase migration up --local && npx vitest run -c vitest.db.config.ts tests/supabase/event_media.test.ts tests/supabase/rls_guard.test.ts tests/supabase/privacy_guard.test.ts tests/supabase/privacy.test.ts`. Очекувано: PASS.

- [ ] **Step 6: Git команди за корисникот:**
```bash
git add supabase/migrations/0080_event_media.sql tests/supabase/event_media.test.ts tests/supabase/rls_guard.test.ts tests/supabase/privacy-classification.ts tests/supabase/privacy.test.ts lib/privacy/export.ts
git commit -m "feat(db): event media tables, private bucket and cleanup for guest photos and greetings"
```

---

### Task 2: Чисти помошни функции (лимити, формат, видео sniff, ZIP)

**Files:**
- Create: `lib/media/limits.ts`, `lib/media/sniff.ts`, `lib/media/zip.ts`
- Test: `tests/lib/pure/media-limits.test.ts`, `tests/lib/pure/media-sniff.test.ts`, `tests/lib/pure/zip.test.ts` (веќе во unit glob `tests/lib/pure/**`)

**Interfaces (Produces):**
```ts
// lib/media/limits.ts
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;
export const PHOTO_MAX_EDGE = 2560;
export const DEFAULT_STORAGE_BYTES = 5 * 1024 ** 3;
export function formatBytes(bytes: number): string;            // "13,2 GB", "850 MB", "0 MB" (mk decimal comma, 1 decimal ≥ 1 GB)
export type StorageUsage = { limitBytes: number; photoBytes: number; videoBytes: number };
export function storageBreakdown(u: StorageUsage): { usedBytes: number; freeBytes: number; photoPct: number; videoPct: number; freePct: number; full: boolean };
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number };
// lib/media/sniff.ts
export type VideoExtension = "mp4" | "mov" | "webm";
export function sniffVideoType(bytes: Uint8Array): VideoExtension | null;
// lib/media/zip.ts
export type ZipEntry = { name: string; size: number; open: () => Promise<ReadableStream<Uint8Array>> };
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array>;   // STORE, data descriptors, UTF-8 names, no ZIP64
export function planZipParts<T extends { bytes: number }>(items: T[], maxBytes?: number, maxFiles?: number): T[][]; // defaults 1.5 GB, 400
```

- [ ] **Step 1: Failing tests.** Главни случаи:

```ts
// media-limits.test.ts
expect(formatBytes(13.2 * 1024 ** 3)).toBe("13,2 GB");
expect(formatBytes(850 * 1024 ** 2)).toBe("850 MB");
expect(formatBytes(0)).toBe("0 MB");
expect(storageBreakdown({ limitBytes: 100, photoBytes: 60, videoBytes: 30 })).toEqual({ usedBytes: 90, freeBytes: 10, photoPct: 60, videoPct: 30, freePct: 10, full: false });
expect(storageBreakdown({ limitBytes: 100, photoBytes: 90, videoBytes: 30 }).full).toBe(true);   // over: free clamps to 0
expect(storageBreakdown({ limitBytes: 100, photoBytes: 90, videoBytes: 30 }).freePct).toBe(0);
expect(fitWithin(4000, 3000, 2560)).toEqual({ width: 2560, height: 1920 });
expect(fitWithin(1000, 800, 2560)).toEqual({ width: 1000, height: 800 });
// media-sniff.test.ts
const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 0x18, ...Buffer.from("ftyp" + brand)]);
expect(sniffVideoType(ftyp("isom"))).toBe("mp4");
expect(sniffVideoType(ftyp("mp42"))).toBe("mp4");
expect(sniffVideoType(ftyp("qt  "))).toBe("mov");
expect(sniffVideoType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))).toBe("webm");
expect(sniffVideoType(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
// zip.test.ts: build a zip of two entries (one Cyrillic name), write to os.tmpdir(), then
//   execFileSync("unzip", ["-t", file]) contains "No errors detected"; `unzip -p file "фото.jpg"` equals the input bytes.
expect(planZipParts([{ bytes: 10 }, { bytes: 10 }, { bytes: 10 }], 25, 400).map((p) => p.length)).toEqual([2, 1]);
expect(planZipParts([{ bytes: 1 }, { bytes: 1 }, { bytes: 1 }], 100, 2).map((p) => p.length)).toEqual([2, 1]);
expect(planZipParts([], 100, 2)).toEqual([]);
```

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run tests/lib/pure/media-*.test.ts tests/lib/pure/zip.test.ts`
- [ ] **Step 3: Implement.** `sniffVideoType` проверува `ftyp` на bytes 4–8. Brand `qt  ` → mov, други ftyp → mp4, EBML `1A 45 DF A3` → webm. `zipStream`: за секој entry се пишува local header (`0x04034b50`, version 20, flags `0x0808`, method 0, CRC и големини 0, UTF-8 име). Потоа се стримираат податоците додека CRC се пресметува инкрементално со `zlib.crc32(chunk, crc)`. Следува data descriptor (`0x08074b50`, crc, size, size). На крај: central directory (`0x02014b50`, вистински crc и size, offset) и EOCD (`0x06054b50`). Ако збирот на offset-ите надмине `0xFFFFFFFF`, се фрла `Error` (planZipParts тоа го спречува). `planZipParts` е greedy по редослед.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Git:**
```bash
git add lib/media/limits.ts lib/media/sniff.ts lib/media/zip.ts tests/lib/pure/media-limits.test.ts tests/lib/pure/media-sniff.test.ts tests/lib/pure/zip.test.ts
git commit -m "feat(media): size limits, storage breakdown, video sniffing and a streaming zip writer"
```

---

### Task 3: Серверски слој за албум и фотографии

**Files:**
- Create: `lib/media/storage.ts` (bucket, head и големина на објект, pending sweep), `lib/media/album.ts` (токен, квота, употреба), `lib/media/photos.ts`
- Modify: `lib/storage-cleanup.ts` (без промена на логиката; само го извезува sweep-от во cron-от во Task 11)
- Test: `tests/lib/media/album.test.ts`, `tests/lib/media/photos.test.ts` (DB suite)

**Interfaces:**
- Consumes: Task 1 schema, Task 2 limits/sniff.
- Produces:
```ts
// lib/media/storage.ts
export const MEDIA_BUCKET = "event-media";
export async function readObjectHead(path: string): Promise<{ head: Uint8Array; size: number } | null>; // Range 0-31, size from Content-Range
export async function sweepStalePendingMedia(maxAgeMs?: number): Promise<{ removed: number }>;   // pending/<event>/<uuid> older than 24 h
// lib/media/album.ts
export type PublicAlbum = { eventId: string; coupleNames: string; eventDate: string; venueName: string };
export async function getOrCreateAlbumToken(eventId: string): Promise<string>;       // randomBytes(18).toString("base64url") → 24 chars
export async function getAlbumByToken(token: string): Promise<PublicAlbum | null>;   // null if unknown or event erased
export async function getStorageLimitBytes(eventId: string): Promise<number>;        // DEFAULT_STORAGE_BYTES until Session 1's storage_gb exists
export async function getStorageUsage(eventId: string): Promise<StorageUsage>;
export const QUOTA_FULL_ERROR = "Просторот за овој албум е полн. Парот може да активира поголем пакет.";
export async function assertQuotaFor(eventId: string, extraBytes: number): Promise<void>; // throws Error(QUOTA_FULL_ERROR)
// lib/media/photos.ts
export type EventPhoto = { id: string; url: string; width: number | null; height: number | null; uploaderName: string | null; hidden: boolean; createdAt: string; bytes: number };
export const PHOTO_TOO_LARGE_ERROR = "Фотографијата е преголема (најмногу 15 MB).";
export const UNSUPPORTED_MEDIA_ERROR = "Датотеката не е поддржана слика. Изберете JPEG, PNG или WebP.";
export const INVALID_MEDIA_UPLOAD_ERROR = "Неважечко прикачување.";
export async function createPhotoUpload(eventId: string, declaredBytes: number): Promise<{ path: string; token: string }>; // pending/<event>/<uuid>
export async function confirmPhotoUpload(eventId: string, input: { path: string; uploaderName?: string | null; width?: number; height?: number }): Promise<{ id: string }>;
export async function listPhotos(eventId: string, opts?: { includeHidden?: boolean; limit?: number; before?: string }): Promise<EventPhoto[]>; // signed URLs 1 h
export async function setPhotoHidden(eventId: string, photoId: string, hidden: boolean): Promise<void>;
export async function deletePhoto(eventId: string, photoId: string): Promise<void>; // row delete → trigger queues → drain
export async function listPhotoFiles(eventId: string): Promise<{ id: string; path: string; bytes: number; createdAt: string; mime: string }[]>; // for ZIP
```

- [ ] **Step 1: Failing DB tests.** Шаблон како `tests/supabase/invitation_photo_upload.test.ts` (реален upload преку anon клиент и `uploadToSignedUrl`). Случаи:
  - `getOrCreateAlbumToken` враќа ист токен при втор повик. `getAlbumByToken` ги враќа имињата, датумот и салата. Непознат токен враќа null.
  - Целосен тек: `createPhotoUpload` → upload на JPEG → `confirmPhotoUpload`. Редот има `bytes` = вистинската големина, `mime` jpeg, патека `<event>/photos/<uuid>.jpg`, а `pending/` е празен.
  - Кога се прикачува PNG-header фајл со `.jpg` име, confirm го зачувува како `.png`. Текст фајл е одбиен со `UNSUPPORTED_MEDIA_ERROR`, а објектот е избришан.
  - Патека од друг настан е одбиена со `INVALID_MEDIA_UPLOAD_ERROR`.
  - `createPhotoUpload(eventId, 16 MB)` е одбиен со `PHOTO_TOO_LARGE_ERROR`.
  - Квота: за тестот `getStorageLimitBytes` се заменува со `vi.spyOn` на 1000 бајти. Upload од 2000 бајти при confirm е одбиен со `QUOTA_FULL_ERROR`, објектот е избришан и нема нов ред (**Review Focus 2**).
  - `setPhotoHidden(true)`: `listPhotos` без `includeHidden` ја скрива, а со `includeHidden` ја враќа со `hidden: true`. Туѓ `eventId` не влијае на редот.
  - `deletePhoto` го брише редот и фајлот (по `drainStorageCleanupQueue`).
  - `sweepStalePendingMedia(0)` брише pending објект, а `sweepStalePendingMedia(1 h)` не го брише свежиот (**Review Focus 5**).
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run -c vitest.db.config.ts tests/lib/media`
- [ ] **Step 3: Implement.** Сè е `import "server-only"` и користи `createServiceRoleClient()`. `readObjectHead` е копија на шаблонот од `lib/couple/invitations.ts:82`, но го чита и `Content-Range` (`/(\d+)$/`) за големината. Не се извезува од invitations.ts, бидејќи тој фајл го менува Сесија 2. Confirm редослед: провери патеката (`^pending/<eventId>/<uuid>$`), прочитај head и големина, одбиј ако е > MAX_PHOTO_BYTES, `sniffImageType` → дозволени само jpg/png/webp, `assertQuotaFor(eventId, size)`, `move` на `<event>/photos/<uuid>.<ext>`, insert на ред со `consent_at: now()`. Кога проверка не поминува, објектот се брише пред да се фрли грешката. `getStorageLimitBytes`: при извршување, ако постои `lib/entitlements` со limit `storage_gb`, се користи тој (× 1024³). Инаку `DEFAULT_STORAGE_BYTES` и Hub белешка до Сесија 1.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Git:**
```bash
git add lib/media/storage.ts lib/media/album.ts lib/media/photos.ts tests/lib/media/album.test.ts tests/lib/media/photos.test.ts
git commit -m "feat(media): album tokens, storage quota and guest photo upload/confirm/moderation"
```

---

### Task 4: Серверски слој за честитки (текст + видео)

**Files:**
- Create: `lib/media/greetings.ts`
- Test: `tests/lib/media/greetings.test.ts`

**Interfaces:**
- Consumes: Task 3 (`readObjectHead`, `assertQuotaFor`, `MEDIA_BUCKET`), Task 2 (`sniffVideoType`, `MAX_VIDEO_BYTES`).
- Produces:
```ts
export type Greeting = { id: string; firstName: string; lastName: string; message: string; videoUrl: string | null; hidden: boolean; createdAt: string };
export const VIDEO_TOO_LARGE_ERROR = "Видеото е преголемо (најмногу 100 MB).";
export const UNSUPPORTED_VIDEO_ERROR = "Видеото не е поддржано. Снимете MP4, MOV или WebM.";
export async function createVideoUpload(eventId: string, declaredBytes: number): Promise<{ path: string; token: string }>;
export async function createGreeting(eventId: string, input: { firstName: string; lastName: string; message: string; videoPath?: string | null }): Promise<{ id: string }>;
export async function listGreetings(eventId: string, opts?: { includeHidden?: boolean }): Promise<Greeting[]>;
export async function setGreetingHidden(eventId: string, id: string, hidden: boolean): Promise<void>;
export async function deleteGreeting(eventId: string, id: string): Promise<void>;
```

- [ ] **Step 1: Failing tests.**
  - Текстуална честитка: името и презимето се со trim и се зачувуваат. Празно презиме (само празни места) е одбиено со `Error("Внесете име и презиме.")`.
  - Честитка со видео (фајл со ftyp isom header) → `videos/<uuid>.mp4`, `video_bytes` е вистинската големина. Видео со JPEG header е одбиено со `UNSUPPORTED_VIDEO_ERROR`, а објектот е избришан.
  - Видео над квотата е одбиено со `QUOTA_FULL_ERROR`.
  - Hide, list и delete, исто како кај фото.
- [ ] **Step 2: Run FAIL** → **Step 3: Implement** (иста структура како photos.ts) → **Step 4: Run PASS.**
- [ ] **Step 5: Git:**
```bash
git add lib/media/greetings.ts tests/lib/media/greetings.test.ts
git commit -m "feat(media): guest greetings with optional video"
```

---

### Task 5: Јавни API рути за гости + rate limits

**Files:**
- Create: `app/api/e/[token]/photos/route.ts`, `app/api/e/[token]/photos/confirm/route.ts`, `app/api/e/[token]/greetings/route.ts`, `app/api/e/[token]/greetings/video/route.ts`
- Modify: `lib/security/rate-limit.ts` (нови правила во `RATE_LIMITS`), `lib/api/schemas.ts` (шеми)
- Test: `tests/supabase/guest_album_routes.test.ts`

**Interfaces:**
- Consumes: Tasks 3–4.
- Produces: HTTP:
  - `POST /api/e/:token/photos {bytes:int>0, mime:"image/jpeg"|"image/png"|"image/webp"}` → `{path, token}`
  - `POST /api/e/:token/photos/confirm {path, uploader_name?: ≤120, consent: true, width?, height?}` → `{id}`
  - `POST /api/e/:token/greetings/video {bytes}` → `{path, token}`
  - `POST /api/e/:token/greetings {first_name, last_name, message, video_path?}` → `{id}`
  - Непознат токен дава 404 `{error: "Албумот не постои."}`.
  
  Rate rules:
  - `albumUpload: { bucket: "album-upload", limit: 120, windowSeconds: 3600, failClosed: false }` по IP+token
  - `albumUploadEvent: { bucket: "album-upload-event", limit: 3000, windowSeconds: 3600, failClosed: false }` по event
  - `greeting: { bucket: "greeting", limit: 10, windowSeconds: 3600, failClosed: false }` по IP+token

- [ ] **Step 1: Failing tests.** Се повикуваат route handlers директно (`NextRequest` со `x-real-ip`):
  - Непознат токен дава 404 на сите четири рути.
  - `consent: false` или без consent дава 400 `"Потребна е согласност за прикажување во албумот."`.
  - Целосен тек (photos → upload → confirm) дава 200, и редот постои.
  - Rate limit: 121-от повик од ист IP дава 429. За тестот се користи `checkRateLimit` со store во меморија, преку `vi.spyOn` на `postgresRateLimitStore`.
  - Честитка без име дава 400.
- [ ] **Step 2: Run FAIL** → **Step 3: Implement.** Користи `withPublic({ params: z.object({ token: z.string().min(22).max(64) }), body, fallbackError })`. Handler: `getAlbumByToken` → 404, потоа rate limit, па lib функцијата. `video_greetings`: ако Сесија 1 ја има `feature` опцијата за јавни рути, се додава. Инаку е вклучено.
- [ ] **Step 4: Run PASS.**
- [ ] **Step 5: Git:**
```bash
git add app/api/e lib/security/rate-limit.ts lib/api/schemas.ts tests/supabase/guest_album_routes.test.ts
git commit -m "feat(api): public guest album routes for photos and greetings"
```

---

### Task 6: Гостинска страница `/e/[token]` (C1, C2, C7)

**Files:**
- Create: `app/e/[token]/page.tsx`, `app/e/[token]/not-found.tsx`, `components/album/GuestAlbum.tsx` (client), `components/album/compress.ts`, `components/album/guest-album.css`
- Modify: `next.config.mjs`: во CSP се додава `media-src 'self' blob: ${supabaseOrigin}` (видео од потпишани URL)
- Test: `tests/components/album/GuestAlbum.test.tsx`, `tests/lib/pure/compress.test.ts`

**Interfaces:**
- Consumes: Task 5 HTTP, `getAlbumByToken`, Task 2 limits.
- Produces: `compressImage(file: File, maxEdge?: number): Promise<{ blob: Blob; width: number; height: number }>`. Фрла `PhotoProcessError` (класа со `message` на мк) кога декодирањето не успее.

- [ ] **Step 1: Failing tests.**
  - `GuestAlbum` (RTL, `fetch` е mock): копчето „Прикачи“ е оневозможено додека не е штиклирана согласноста. Формата за честитка без презиме покажува „Внесете име и презиме.“. По успешна честитка се прикажува „Ви благодариме! Честитката е испратена.“. Кога upload дава 413/400 со `QUOTA_FULL_ERROR`, пораката се прикажува. Напредокот е „3 / 10 прикачени“.
  - `compressImage`: `createImageBitmap` е mock што фрла, и функцијата одбива со `PhotoProcessError("Оваа фотографија не може да се обработи. Обидете се со JPEG или направете screenshot.")` (**Review Focus 1**). Mock bitmap 4000×3000 дава canvas 2560×1920.
- [ ] **Step 2: Run FAIL.**
- [ ] **Step 3: Implement.**
  - Server `page.tsx`: `getAlbumByToken`, при null `notFound()`, `robots: noindex`, `dynamic = "force-dynamic"`. Се рендерираат имиња и датум и `<GuestAlbum token=…>`.
  - Client: `<input type="file" accept="image/*" multiple>` → секвенцијално, 3 паралелно: compress, `POST photos`, `uploadToSignedUrl` (supabase browser client), `POST confirm`. Опционално „Ваше име“ (зачувано во localStorage, try/catch). Checkbox „Се согласувам фотографијата да биде прикажана во свадбениот албум“.
  - Честитка: име, презиме, порака (≤1000 со бројач) и опционално „Снимете видео честитка“ (`accept="video/*" capture="user"`). Преку `<video>` metadata се одбива > 30 s или > 100 MB. Upload оди преку `greetings/video`, потоа `POST greetings`.
  - CSS: крем `#F5EFE4`, злато `#B8913A`, серифни наслови, копчиња ≥ 44 px, една колона, `lang` наследен.
- [ ] **Step 4: Run PASS** + рачна проверка на 390px во dev.
- [ ] **Step 5: Git:**
```bash
git add app/e components/album next.config.mjs tests/components/album tests/lib/pure/compress.test.ts
git commit -m "feat(album): guest QR page to upload photos and leave greetings"
```

---

### Task 7: Албум кај парот + модерирање + приказ на простор (C3, C5, C10)

**Files:**
- Create: `app/api/couple/album/photos/[id]/route.ts` (PATCH `{hidden:boolean}`, DELETE), `components/couple/AlbumClient.tsx`, `components/couple/StorageMeter.tsx`
- Modify: `app/couple/(protected)/album/page.tsx` (замена на ComingSoon)
- Test: `tests/components/couple/StorageMeter.test.tsx`, `tests/components/couple/AlbumClient.test.tsx`, `tests/supabase/couple_album_routes.test.ts`

**Interfaces:**
- Consumes: Task 3 (`listPhotos`, `setPhotoHidden`, `deletePhoto`, `getStorageUsage`, `getOrCreateAlbumToken`), Task 2 (`storageBreakdown`, `formatBytes`, `planZipParts`).
- Produces: `<StorageMeter usage={StorageUsage} />` (го користи и Task 12 на почетна).

- [ ] **Step 1: Failing tests.**
  - `StorageMeter` рендерира „Ваш простор: 20 GB“ и „Искористено: 13,2 GB / 20 GB“, три сегменти со `aria-label` „Фотографии 60 %“, „Видеа 6 %“ и „Останато 34 %“, и CTA линк „Активирајте дополнителен пакет за повеќе простор“ → `/couple/packages`. При `full` се покажува и предупредување.
  - `AlbumClient`: филтер по прикачувач го намалува grid-от. „Скриј“ повикува PATCH и ја означува сликата „Скриена“. „Избриши“ бара `confirm` и ја трга од grid-от. Прегледот (dialog) се затвора со Esc. Линковите „Преземи ги сите (дел 1 од 2)“ се по `planZipParts`.
  - Рути: couple од друг настан не може да скрие или избрише туѓа фотографија (200 без ефект, или 404). Невалиден id дава 400.
- [ ] **Step 2: Run FAIL** → **Step 3: Implement.** Grid со `loading="lazy"`, 60 по страна, копче „Прикажи уште“ (`before` cursor преку server action или fetch). Горе е линк до гостинската страница, QR и „Печати QR картички“ → `/couple/album/qr`.
- [ ] **Step 4: Run PASS.**
- [ ] **Step 5: Git:**
```bash
git add app/api/couple/album components/couple/AlbumClient.tsx components/couple/StorageMeter.tsx "app/couple/(protected)/album/page.tsx" tests/components/couple/StorageMeter.test.tsx tests/components/couple/AlbumClient.test.tsx tests/supabase/couple_album_routes.test.ts
git commit -m "feat(album): couple album with moderation and storage meter"
```

---

### Task 8: „Преземи ги сите“ — ZIP (C3)

**Files:**
- Create: `app/api/couple/album/zip/route.ts`
- Test: `tests/supabase/album_zip.test.ts`

**Interfaces:** `GET /api/couple/album/zip?part=N` (1-based) → `200 application/zip`, `Content-Disposition: attachment; filename="album-<датум>-del-N.zip"`, stream. Неважечки дел дава 400. Скриените фотографии не се вклучени. Имиња: `001-<прикачувач или "gostin">-<hhmm>.jpg`.

- [ ] **Step 1: Failing test.** Се прикачуваат 3 мали JPEG (едната скриена), се повикува рутата, body се пишува во tmp и `unzip -l` покажува 2 фајла. `unzip -t` е OK. `part=5` дава 400.
- [ ] **Step 2: FAIL** → **Step 3: Implement.** `listPhotoFiles` → `planZipParts` → `zipStream(entries)`. `open()` прави `createSignedUrl` + `fetch().body`. `export const maxDuration = 300`. Response е `new Response(stream, …)`. Лимитот од 4,5 MB важи само за request body, а овој response е стримиран.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Git:**
```bash
git add app/api/couple/album/zip tests/supabase/album_zip.test.ts
git commit -m "feat(album): download all photos as zip parts"
```

---

### Task 9: Страница „Честитки“ кај парот (C2, C7)

**Files:**
- Create: `app/api/couple/greetings/[id]/route.ts` (PATCH/DELETE), `components/couple/GreetingsClient.tsx`
- Modify: `app/couple/(protected)/greetings/page.tsx`
- Test: `tests/components/couple/GreetingsClient.test.tsx`, додавање во `tests/supabase/couple_album_routes.test.ts`

- [ ] **Step 1: Failing tests.** Картичките покажуваат „Ана Петрова“, порака и датум (`dd.mm.yyyy`). Кога има видео, има `<video controls preload="none">`. Празна состојба: „Сè уште нема честитки. Споделете го QR кодот од Албум.“ Скриј и избриши работат како кај фото. Друг настан не може да ги менува туѓите честитки.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Git:**
```bash
git add app/api/couple/greetings components/couple/GreetingsClient.tsx "app/couple/(protected)/greetings/page.tsx" tests/components/couple/GreetingsClient.test.tsx tests/supabase/couple_album_routes.test.ts
git commit -m "feat(greetings): couple greetings page with video and moderation"
```

---

### Task 10: Печатливи QR шаблони (C4)

**Files:**
- Create: `app/couple/(protected)/album/qr/page.tsx`, `components/couple/album-print.css`
- Test: `tests/components/couple/AlbumQrPrint.test.tsx` (ја рендерира server компонентата со mock `getOrCreateAlbumToken`)

**Interfaces:** `?format=a6|a4` (default a6), `?count=1..60` (default 8) и опционално `?numbered=1` (картичките добиваат „Маса N“). Податоци од Сесија 3 не се користат, само бројачот. QR: `QRCode.toString(url, { type: "svg", margin: 1 })`, каде url = `${origin}/e/<token>`, а origin е од `headers()` host.

- [ ] **Step 1: Failing test.** Со a6 и count=8 се добиваат 8 картички со текст „Скенирај и сподели ги твоите фотографии“ и `<svg>`. Со a4 се добива една страна-постер. `count=999` се ограничува на 60. Со `numbered=1` се добиваат „Маса 1“ … „Маса 8“.
- [ ] **Step 2–4.** Print CSS: `@page { size: A4; margin: 10mm }`, A6 = 4 по A4 (2×2), `break-inside: avoid`. Контролите се сокриени со `@media print`, копчето е „Печати“ (`window.print`, мала client компонента).
- [ ] **Step 5: Git:**
```bash
git add "app/couple/(protected)/album/qr" components/couple/album-print.css tests/components/couple/AlbumQrPrint.test.tsx
git commit -m "feat(album): printable QR cards and poster for the guest album"
```

---

### Task 11: Retention на медиуми + cron + документи (C6, C8, C9)

**Files:**
- Create: `lib/media/retention.ts`
- Modify: `app/api/cron/storage-cleanup/route.ts` (повикува `sweepStalePendingMedia` и `runMediaRetention`), `docs/production/RETENTION.md`, `docs/production/DECISIONS.md`, `.env.local.example` (`MEDIA_RETENTION_DAYS=` празно = исклучено)
- Test: `tests/lib/media/retention.test.ts`

**Interfaces:**
```ts
export async function runMediaRetention(opts?: { days?: number | null; now?: Date; notify?: (to: string, coupleNames: string, deleteOn: string) => Promise<void> }):
  Promise<{ skipped: true } | { noticed: number; purgedEvents: number }>;
```
Ако `days` е null или undefined (од `MEDIA_RETENTION_DAYS`), се враќа `{skipped:true}`. 5 дена пред `event_date + days`, за настани со медиуми и без `retention_notice_sent_at`: се праќа email до `contact_email` (ако `emailConfigured()`), се поставува `retention_notice_sent_at`. По `event_date + days`: се бришат `event_photos` и `event_greetings` (тригерите ги ставаат фајловите во редот), па се повикува `drainStorageCleanupQueue()`. Аудит: `audit_log` action `event_media_purged` со `{photos, greetings}`.

- [ ] **Step 1: Failing test.** Без days се добива `skipped`. Настан пред 58 дена со days=60 добива notify еднаш (втор run: 0). Настан пред 61 ден со days=60 ги губи медиумите. Настан пред 10 дена е недопрен.
- [ ] **Step 2–4.**
- [ ] **Step 5: Docs.** RETENTION.md: нов ред во табелите 1 и 2 (медиуми: „по `MEDIA_RETENTION_DAYS` / `photo_retention_days` по настанот, исклучено додека сопственикот не одлучи“). DECISIONS.md:
  - „Taken“: event-media приватен bucket и service role
  - видео без транскодирање (720p подоцна)
  - HEIC се потпира на конверзија во прелистувачот
  - C8 (лого watermark) и C9 (фото студио): подоцна
  - retention исклучен до одлука
- [ ] **Step 6: Git:**
```bash
git add lib/media/retention.ts app/api/cron/storage-cleanup/route.ts docs/production/RETENTION.md docs/production/DECISIONS.md .env.local.example tests/lib/media/retention.test.ts
git commit -m "feat(media): retention notice and purge for guest media (off until configured)"
```

---

### Task 12: Навигација кај парот + простор на почетна (D3, C5)

**Files:**
- Modify: `components/couple/shell/nav.ts` (Албум и Честитки `ready: true`, Пораки отстранета), `app/couple/(protected)/messages/page.tsx` (`redirect("/couple")`), `app/couple/(protected)/page.tsx` (`<StorageMeter>` во страничната колона, само кога има барем една фотографија или честитка)
- Test: `tests/lib/pure/couple-nav.test.ts`

- [ ] **Step 1: Failing test:**
```ts
import { buildCoupleNavItems } from "@/components/couple/shell/nav";
it("has no placeholder items", () => {
  const items = buildCoupleNavItems([{ id: "r1", name: "Сала" }]);
  expect(items.filter((i) => !i.ready)).toEqual([]);
  expect(items.map((i) => i.href)).not.toContain("/couple/messages");
  expect(items.map((i) => i.href)).toEqual(expect.arrayContaining(["/couple/album", "/couple/greetings"]));
});
```
- [ ] **Step 2–4.**
- [ ] **Step 5: Git:**
```bash
git add components/couple/shell/nav.ts "app/couple/(protected)/messages/page.tsx" "app/couple/(protected)/page.tsx" tests/lib/pure/couple-nav.test.ts
git commit -m "feat(couple): album and greetings live in the nav; hide messages placeholder"
```

---

### Task 13: Мобилна навигација — drawer за двата shell-а (D1)

**Files:**
- Create: `components/venue/shell/useDrawer.ts`
- Modify: `components/venue/shell/PanelShell.tsx`, `components/couple/shell/CoupleShell.tsx`, `app/venue/panel.css` (блок `@media (max-width: 900px)` на ред ~961 се заменува за `.side`)
- Test: `tests/components/venue/shell/Drawer.test.tsx`

**Interfaces:**
```ts
export function useDrawer(): {
  open: boolean; toggle: () => void; close: () => void;
  drawerRef: React.RefObject<HTMLElement | null>;   // attach to <aside className="side">
  buttonRef: React.RefObject<HTMLButtonElement | null>;
};
// Esc closes and returns focus to the button; Tab/Shift+Tab cycle inside the drawer while open;
// closes on pathname change; sets document.body.style.overflow = "hidden" while open.
```
Markup: во `header.top` оди `<button className="burger" aria-controls="panel-nav" aria-expanded={open} aria-label="Мени">`. На `<aside id="panel-nav" className={"side" + (open ? " open" : "")}>`, и кога е отворено, `<div className="scrim" onClick={close} />`.

- [ ] **Step 1: Failing test** (двата shell-а, `next/navigation` е mock):
  - Копчето „Мени“ има `aria-expanded="false"`. По клик е `true`, и aside има класа `open`.
  - Esc затвора, и фокусот се враќа на копчето.
  - Tab од последниот линк во drawer-от оди на првиот фокусабилен елемент во drawer-от.
  - Промена на pathname го затвора drawer-от.
  - Клик на scrim затвора.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement + CSS** (≤ 900px):
  - `.vp .burger { display: inline-flex }` (инаку `none`), а `.vp .side` е `position: fixed; inset: 0 auto 0 0; width: min(300px, 85vw); transform: translateX(-100%); transition; z-index: 60; overflow-y: auto`.
  - `.vp .side.open` добива `translateX(0)`, а `.vp .scrim` е `position: fixed; inset: 0; background: rgb(0 0 0 / .4); z-index: 55`.
  - `.side-toggle` се сокрива, `.top` е `position: sticky; top: 0`, а `.meta` се собира (се крие `meta-lab` и часовникот).
  - Старото правило `flex-direction: row` за `.nav` се брише.
  - `prefers-reduced-motion` ја исклучува транзицијата.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Git:**
```bash
git add components/venue/shell/useDrawer.ts components/venue/shell/PanelShell.tsx components/couple/shell/CoupleShell.tsx app/venue/panel.css tests/components/venue/shell/Drawer.test.tsx
git commit -m "feat(ui): mobile drawer navigation for venue and couple panels"
```

---

### Task 14: Responsive проверка на 390px + e2e за медиуми (D1, прифаќање)

**Files:**
- Create: `e2e/mobile.spec.ts`, `e2e/guest-album.spec.ts`
- Modify: `app/venue/panel.css` (поправки што тестот ги открива: `.vp .main table { display: block; overflow-x: auto }` под 900px, форми во една колона, контејнерот на floor-plan `overflow: auto; touch-action: pan-x pan-y`)

- [ ] **Step 1: Failing e2e** `mobile.spec.ts`: `test.use({ viewport: { width: 390, height: 844 } })`. Страници: venue (`/venue`, `/venue/calendar`, `/venue/reservations`, `/venue/events`, `/venue/events/new`, `/venue/clients`, `/venue/menus`, `/venue/settings`), couple (`/couple`, `/couple/guests`, `/couple/budget`, `/couple/checklist`, `/couple/invitation`, `/couple/album`, `/couple/greetings`), guest (`/invite/<slug>`, `/e/<token>`). За секоја:
```ts
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
expect(overflow, path).toBeLessThanOrEqual(0);
```
  Плус: drawer се отвора со „Мени“ и линк води на друга страница.

  `guest-album.spec.ts` (прифаќање): парот го отвора албумот и го зема линкот до гостинската страница. `anonPage` на 390px прикачува 10 генерирани JPEG (`setInputFiles` со buffers), се штиклира согласноста и се чека „10 / 10 прикачени“. Потоа честитка со име и презиме. Парот гледа 10 слики, скрива една, а ZIP линкот враќа `application/zip`.
- [ ] **Step 2: Run FAIL:** `npx playwright test e2e/mobile.spec.ts e2e/guest-album.spec.ts`
- [ ] **Step 3: Поправки во CSS** додека не помине. Секоја поправка е во `panel.css` под `@media (max-width: 900px)` или 640px. За floor-plan canvas, ако прелева поради внатрешна ширина, се ограничува контејнерот (не canvas-от). Zoom и pinch → Hub белешка до Сесија 3.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Git:**
```bash
git add e2e/mobile.spec.ts e2e/guest-album.spec.ts app/venue/panel.css
git commit -m "test(e2e): 390px no-overflow check and guest album flow; responsive fixes"
```

---

### Task 15: Пристапност (D2)

**Files:**
- Modify: `app/layout.tsx` (`lang="mk"`), `app/en/layout.tsx` (ако постои, wrapper `<div lang="en">`; инаку се креира), `app/venue/panel.css` и `app/globals.css` (`--muted` ≥ 4.5:1), labels во фајловите од A11Y.md #1 **освен** на Сесија 2 (`components/invite/**`, `GuestsClient`): couple home contact inputs, venue reservations date/party-size, invitation „Порака“ textarea, NewEventForm contact inputs
- Modify: `e2e/a11y.spec.ts` (нови страници `/couple/album`, `/couple/greetings`, `/e/<token>`, `/couple/album/qr` секогаш strict. За старите останува `A11Y_STRICT`)
- Modify: `docs/production/A11Y.md` (статус по наод)

- [ ] **Step 1: Failing:** `npx playwright test e2e/a11y.spec.ts --reporter=list`. Новите страници треба да се без serious/critical. Се запишуваат старите `[a11y]` линии.
- [ ] **Step 2: Fix:** labels (`<label htmlFor>` или `aria-label` на мк), `--muted`, `lang`.
- [ ] **Step 3: Run:** `A11Y_STRICT=1 npx playwright test e2e/a11y.spec.ts`. Зелено за сите екрани освен наодите во фајловите на Сесија 2 (Hub белешка со листата).
- [ ] **Step 4: Git:**
```bash
git add app/layout.tsx app/en app/venue/panel.css app/globals.css e2e/a11y.spec.ts docs/production/A11Y.md <фајловите со labels>
git commit -m "fix(a11y): Macedonian page language, labelled inputs, muted-text contrast; strict axe on new pages"
```

---

## Hub

На почеток се креираат task-ови `[S4] C1 …`, `[S4] C2 …`, …, `[S4] D3` и се означуваат `done` кога се верификувани. Белешки (`update_type: "note"`):
- До Сесија 1: `storage_gb`, `video_greetings`, `photo_retention_days` се читаат ако постојат; `/couple/packages` CTA линк
- До Сесија 2: labels во RsvpForm и GuestsClient
- До Сесија 3: zoom/pinch на canvas; venue „Наскоро“ ставки (B9)

(Токенот од CLAUDE.md претходно врати `Invalid token`. Ако се повтори, ја известувам корисникот.)
