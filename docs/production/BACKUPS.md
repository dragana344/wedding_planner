# Backups and restore (DATA-001, DATA-002)

## What is backed up

| Layer | Mechanism | Frequency | Retention | Where |
|---|---|---|---|---|
| Database (Postgres) | Supabase managed backups (Pro) | Daily (+ PITR if enabled) | 7 days on Pro (PITR: chosen window) | Supabase, eu-west-1 |
| Database, off-site | `.github/workflows/backup.yml`: `supabase db dump` (roles, schema, data) | Nightly 01:30 UTC | 35 days (R2 lifecycle rule) | Cloudflare R2 bucket `wedding-planner-backups` (EU jurisdiction) |
| Storage objects (photos) | Same workflow: `scripts/backup/download-storage.mjs` copies all three buckets | Nightly | 35 days | Same R2 archive (`backup-<timestamp>.tar.gz.enc`, AES-256, key `BACKUP_ENCRYPTION_KEY`) |

Supabase's own backups do **not** contain Storage objects; the nightly archive is the only copy of the photos outside Supabase.

**Freshness:** the workflow's `freshness` job fails if the newest archive in R2 is older than 36 hours; a failed scheduled workflow emails the repository admins (make sure notifications for Actions are on). Uptime monitoring (OBS-003) is separate.

## Setup (owner)

1. Supabase → Database → Backups: confirm daily backups are listed (Pro). Optional: enable PITR.
2. Cloudflare R2: bucket `wedding-planner-backups`, jurisdiction EU, no public access, lifecycle rule "delete objects older than 35 days"; API token *Object Read & Write* scoped to that bucket.
3. GitHub → Settings → Environments → `production` → add secrets:
   - `SUPABASE_DB_URL`: the session-pooler connection string with the database password (Supabase → Connect → Session pooler), percent-encoded.
   - `SUPABASE_SERVICE_ROLE_KEY`: production secret key (to read Storage).
   - `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` (`https://<account_id>.r2.cloudflarestorage.com`), `R2_BUCKET`.
   - `BACKUP_ENCRYPTION_KEY`: a long random passphrase (`openssl rand -base64 48`). **Store it in the owner's password manager too** — archives cannot be restored without it, and GitHub secrets cannot be read back.
4. Run the workflow once by hand (Actions → Backup → Run workflow) and check the object in R2.

Who can restore: the Supabase org owner (managed backups/PITR) and anyone holding the R2 token (archives). Keep both lists short.

## Restore procedures

### A. Database from Supabase (most incidents)

Supabase → Database → Backups → pick a daily backup (or a PITR timestamp) → Restore. This replaces the whole database: everything written after that point is lost. Storage objects are unaffected.

### B. From the off-site archive (Supabase backup unusable, or project lost)

```bash
aws s3 cp s3://wedding-planner-backups/daily/backup-<stamp>.tar.gz.enc . --endpoint-url https://<account_id>.r2.cloudflarestorage.com
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -in backup-<stamp>.tar.gz.enc | tar -xzf -
gunzip backup/*.sql.gz
# into an EMPTY Supabase project (new, or the drill project):
psql "$TARGET_DB_URL" -f backup/roles.sql
psql "$TARGET_DB_URL" -f backup/schema.sql
psql "$TARGET_DB_URL" -c 'set session_replication_role = replica' -f backup/data.sql
# photos:
SUPABASE_URL=<target> SUPABASE_SERVICE_ROLE_KEY=<target key> node scripts/backup/upload-storage.mjs backup/storage
```

Then point the app at the restored project (Vercel env), redeploy, and check `/api/health`.

**After any restore, re-apply erasures made since the backup was taken**: every `event_personal_data_erased` and `venue_account_deleted` row in `audit_log` newer than the backup identifies an event or venue whose personal data must be erased again (`erase_event_personal_data`, `delete_venue_account`, see RETENTION.md). A restored backup must never bring erased people back.

## Restore drill (DATA-002)

Once before launch, then every quarter:

1. Create an isolated Supabase project `wedding-planner-restore-drill` (Free is enough). It is the **only** place a production backup may ever be restored (DATA-010).
2. Restore the latest R2 archive into it with procedure B. Time each step.
3. Check: row counts of `venues`, `events`, `event_guests`, `reservations` match production at backup time; a sample photo URL loads; the app started locally against it (`.env.local` pointing at the drill project, never committed) shows a venue dashboard.
4. **Delete the drill project** and any local copy of the archive.
5. Record the drill below.

| Date | Archive | Time to restore | Result | Notes | By |
|---|---|---|---|---|---|
| — | | | | | |
