import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { VENUE_TIME_ZONE, todayIn } from "@/lib/date";
import { emailConfigured, sendEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";
import { errorFields, log } from "@/lib/log";
import { retentionDays } from "@/lib/media/limits";

// C6: guests' photos and greetings are kept for a number of days after the
// event, then deleted (rows first; the 0080 triggers queue the files). The
// couple is told five days before. The number of days is the event's package
// entitlement `photo_retention_days`; only an enabled feature with a positive
// limit purges (disabled, missing, null or 0 = kept forever). The sweep as a
// whole stays OFF until MEDIA_RETENTION_ENABLED=true: switching deletion of
// guests' photos on is the owner's decision (docs/production/RETENTION.md).

const NOTICE_DAYS = 5;

/** Resolves `false` when the warning could not be sent at all (no email configured). */
export type RetentionNotify = (to: string, coupleNames: string, deleteOn: string) => Promise<void | boolean>;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2019-03-04" → "04.03.2019" */
function shownDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

/** The owner's switch for the whole sweep (RETENTION.md). */
export function mediaRetentionEnabled(): boolean {
  return process.env.MEDIA_RETENTION_ENABLED === "true";
}

/** Days to keep one event's album (null = forever), from its package. */
export type RetentionDaysFor = (eventId: string, venueId: string) => Promise<number | null>;

export const planRetentionDays: RetentionDaysFor = async (eventId, venueId) => {
  const { data, error } = await createServiceRoleClient().rpc("effective_features", { p_venue_id: venueId, p_event_id: eventId });
  if (error) throw error;
  const row = (data as { feature_key: string; enabled: boolean; limit_value: number | null }[] | null)?.find(
    (f) => f.feature_key === "photo_retention_days",
  );
  return retentionDays(row ? { enabled: row.enabled, limit: row.limit_value } : undefined);
};

const emailNotify: RetentionNotify = async (to, coupleNames, deleteOn) => {
  if (!emailConfigured()) return false;
  await sendEmail({
    to,
    subject: `Фотографиите од вашиот албум ќе бидат избришани на ${deleteOn}`,
    text:
      `Почитувани ${coupleNames},\n\n` +
      `Фотографиите и честитките што гостите ги споделија во вашиот албум ќе бидат трајно избришани на ${deleteOn}.\n` +
      `Преземете ги пред тоа: најавете се во вашиот панел, отворете „Албум“ и кликнете „Преземи ги сите“.\n\n` +
      `КАДЕ СУМ?`,
  });
};

type AlbumRow = {
  event_id: string;
  retention_notice_sent_at: string | null;
  events: { event_date: string; contact_email: string | null; couple_names: string; venue_id: string } | null;
};

const PAGE = 500;

/**
 * One pass over the albums whose deletion date is near or past. The couple is
 * always warned first, and the media go no earlier than NOTICE_DAYS after the
 * warning — so switching retention on (or shortening it, e.g. a package
 * change) never deletes an album without notice. A purged album's row goes
 * too: its guest link stops working and later passes no longer see it.
 *
 * Each event's period comes from its package (`daysFor`, default
 * `planRetentionDays`); `days` fixes one period for every event instead
 * (null = skip the run). Without `days`, the run is skipped unless `enabled`
 * (default: MEDIA_RETENTION_ENABLED) is true.
 */
export async function runMediaRetention(
  opts: { days?: number | null; daysFor?: RetentionDaysFor; enabled?: boolean; now?: Date; notify?: RetentionNotify } = {},
): Promise<{ skipped: true } | { noticed: number; purgedEvents: number; kept: number }> {
  const fixedDays = opts.days;
  if (fixedDays === null) return { skipped: true };
  if (fixedDays === undefined && !(opts.enabled ?? mediaRetentionEnabled())) return { skipped: true };
  const daysFor = opts.daysFor ?? planRetentionDays;
  const notify = opts.notify ?? emailNotify;
  const now = opts.now ?? new Date();
  const today = todayIn(VENUE_TIME_ZONE, now);
  const client = createServiceRoleClient();

  // Only events whose own deletion date is at most NOTICE_DAYS away can need
  // work; with per-event periods (0 days at the least) that is every event
  // up to NOTICE_DAYS from now.
  const latestEventDate = addDays(today, NOTICE_DAYS - (fixedDays ?? 0));
  let noticed = 0;
  /** Albums past their date that are kept because no warning could be sent. */
  let unwarned = 0;
  let purgedEvents = 0;
  let kept = 0;
  let cursor = "00000000-0000-0000-0000-000000000000";

  for (;;) {
    const { data, error } = await client
      .from("event_albums")
      .select("event_id, retention_notice_sent_at, events!inner(event_date, contact_email, couple_names, venue_id)")
      .lte("events.event_date", latestEventDate)
      .gt("event_id", cursor)
      .order("event_id")
      .limit(PAGE);
    if (error) throw error;
    const albums = (data ?? []) as unknown as AlbumRow[];

    for (const album of albums) {
      const event = album.events;
      if (!event) continue;
      try {
        const days = fixedDays ?? (await daysFor(album.event_id, event.venue_id));
        if (days === null) {
          kept += 1; // never purged under this package (logged once per run below)
          continue;
        }
        const deleteOn = addDays(event.event_date, days);
        if (deleteOn > addDays(today, NOTICE_DAYS)) continue;

        if (!album.retention_notice_sent_at) {
          const { data: usage } = await client.rpc("event_media_usage", { p_event_id: album.event_id });
          const row = (usage as { photo_count: number; greeting_count: number }[] | null)?.[0];
          if (!row || row.photo_count + row.greeting_count === 0) continue;
          const promised = deleteOn > addDays(today, NOTICE_DAYS) ? deleteOn : addDays(today, NOTICE_DAYS);
          // The couple is always warned first: with no address to write to,
          // or no way to send, the notice is not stamped and the album stays
          // until a warning can really go out.
          const warned = event.contact_email ? (await notify(event.contact_email, event.couple_names, shownDate(promised))) !== false : false;
          if (!warned) {
            unwarned += 1;
            continue;
          }
          const { error: markError } = await client
            .from("event_albums")
            .update({ retention_notice_sent_at: now.toISOString() })
            .eq("event_id", album.event_id);
          if (markError) throw markError;
          noticed += 1;
          continue;
        }

        const noticeDay = todayIn(VENUE_TIME_ZONE, new Date(album.retention_notice_sent_at));
        const earliest = addDays(noticeDay, NOTICE_DAYS);
        if (today < deleteOn || today < earliest) continue;

        const photos = await client.from("event_photos").delete({ count: "exact" }).eq("event_id", album.event_id);
        if (photos.error) throw photos.error;
        const greetings = await client.from("event_greetings").delete({ count: "exact" }).eq("event_id", album.event_id);
        if (greetings.error) throw greetings.error;
        const closed = await client.from("event_albums").delete().eq("event_id", album.event_id);
        if (closed.error) throw closed.error;
        purgedEvents += 1;
        await recordAudit({
          action: "event_media_purged",
          actorType: "system",
          venueId: event.venue_id,
          eventId: album.event_id,
          targetId: album.event_id,
          details: { photos: photos.count ?? 0, greetings: greetings.count ?? 0 },
        });
      } catch (err) {
        // One album's failure (e.g. the email provider) must not hold up the rest; retried next run.
        log("error", "media_retention_failed", { event_id: album.event_id, ...errorFields(err) });
      }
    }

    if (albums.length < PAGE) break;
    cursor = albums[albums.length - 1].event_id;
  }

  if (purgedEvents > 0) await drainStorageCleanupQueue().catch(() => {}); // the hourly cron retries
  if (kept > 0) log("info", "media_retention_kept", { events: kept });
  if (unwarned > 0) log("warn", "media_retention_unwarned", { events: unwarned });
  return { noticed, purgedEvents, kept };
}
