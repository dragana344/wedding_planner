import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { VENUE_TIME_ZONE, todayIn } from "@/lib/date";
import { emailConfigured, sendEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// C6: guests' photos and greetings are kept for a number of days after the
// event, then deleted (rows first; the 0080 triggers queue the files). The
// couple is told five days before. OFF until MEDIA_RETENTION_DAYS is set:
// the period is the owner's decision (docs/production/RETENTION.md). Once the
// package entitlement `photo_retention_days` exists it replaces the env value
// per event.

const NOTICE_DAYS = 5;

export type RetentionNotify = (to: string, coupleNames: string, deleteOn: string) => Promise<void>;

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

export function mediaRetentionDaysFromEnv(): number | null {
  const days = Number.parseInt(process.env.MEDIA_RETENTION_DAYS ?? "", 10);
  return Number.isInteger(days) && days >= 1 ? days : null;
}

const emailNotify: RetentionNotify = async (to, coupleNames, deleteOn) => {
  if (!emailConfigured()) return;
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

export async function runMediaRetention(
  opts: { days?: number | null; now?: Date; notify?: RetentionNotify } = {},
): Promise<{ skipped: true } | { noticed: number; purgedEvents: number }> {
  const days = opts.days === undefined ? mediaRetentionDaysFromEnv() : opts.days;
  if (!days) return { skipped: true };
  const notify = opts.notify ?? emailNotify;
  const today = todayIn(VENUE_TIME_ZONE, opts.now ?? new Date());
  const client = createServiceRoleClient();

  // Only events whose deletion date is at most NOTICE_DAYS away can need work.
  const latestEventDate = addDays(today, NOTICE_DAYS - days);
  const { data, error } = await client
    .from("event_albums")
    .select("event_id, retention_notice_sent_at, events!inner(event_date, contact_email, couple_names, venue_id)")
    .lte("events.event_date", latestEventDate);
  if (error) throw error;

  let noticed = 0;
  let purgedEvents = 0;
  for (const album of (data ?? []) as unknown as AlbumRow[]) {
    const event = album.events;
    if (!event) continue;
    const deleteOn = addDays(event.event_date, days);

    if (today >= deleteOn) {
      const photos = await client.from("event_photos").delete({ count: "exact" }).eq("event_id", album.event_id);
      if (photos.error) throw photos.error;
      const greetings = await client.from("event_greetings").delete({ count: "exact" }).eq("event_id", album.event_id);
      if (greetings.error) throw greetings.error;
      if ((photos.count ?? 0) + (greetings.count ?? 0) > 0) {
        purgedEvents += 1;
        await recordAudit({
          action: "event_media_purged",
          actorType: "system",
          venueId: event.venue_id,
          eventId: album.event_id,
          targetId: album.event_id,
          details: { photos: photos.count ?? 0, greetings: greetings.count ?? 0 },
        });
      }
      continue;
    }

    if (!album.retention_notice_sent_at) {
      const { data: usage } = await client.rpc("event_media_usage", { p_event_id: album.event_id });
      const row = (usage as { photo_count: number; greeting_count: number }[] | null)?.[0];
      if (!row || row.photo_count + row.greeting_count === 0) continue;
      if (event.contact_email) await notify(event.contact_email, event.couple_names, shownDate(deleteOn));
      const { error: markError } = await client
        .from("event_albums")
        .update({ retention_notice_sent_at: new Date().toISOString() })
        .eq("event_id", album.event_id);
      if (markError) throw markError;
      noticed += 1;
    }
  }

  if (purgedEvents > 0) await drainStorageCleanupQueue().catch(() => {}); // the hourly cron retries
  return { noticed, purgedEvents };
}
