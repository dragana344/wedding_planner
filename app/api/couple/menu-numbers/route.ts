import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { organizerSide } from "@/lib/couple/organizer-side";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { todayIn, VENUE_TIME_ZONE } from "@/lib/date";
import { coupleReminderDue, timelineStage } from "@/lib/menu-timeline";
import { changedSince, currentMenuNumbers, listMenuSubmissions, sendMenuNumbers } from "@/lib/couple/menu-submissions";

export const CO_ORGANIZER_SEND_ERROR = "Само главната најава на младенците може да ги испрати бројките.";

export const GET = withCoupleEvent(
  async ({ eventId }) => {
    const [{ numbers, notDone }, [latest = null], { data: event, error }] = await Promise.all([
      currentMenuNumbers(eventId),
      listMenuSubmissions(eventId, 1),
      createServiceRoleClient().from("events").select("event_date, created_at").eq("id", eventId).maybeSingle(),
    ]);
    if (error) throw error;
    // Where the event stands on the final-numbers timeline (any sending, from any side, ends it).
    const timeline = event
      ? {
          eventDate: event.event_date as string,
          createdDate: todayIn(VENUE_TIME_ZONE, new Date(event.created_at as string)),
          today: todayIn(),
          sent: latest !== null,
        }
      : null;
    const stage = timeline ? timelineStage(timeline) : "none";
    // The couple's banner (skipped for events created after the 25-day mark).
    const coupleReminder = timeline ? coupleReminderDue(timeline) : false;
    return NextResponse.json({ current: numbers, notDone, latest, changedSinceLatest: changedSince(latest, numbers), stage, coupleReminder });
  },
  { fallbackError: "Не успеа вчитувањето на бројките." },
);

export const POST = withCoupleEvent(
  async ({ request, eventId }) => {
    if (organizerSide(request) !== null) return NextResponse.json({ error: CO_ORGANIZER_SEND_ERROR }, { status: 403 });
    return NextResponse.json(await sendMenuNumbers(eventId));
  },
  { fallbackError: "Не успеа испраќањето на бројките." },
);
