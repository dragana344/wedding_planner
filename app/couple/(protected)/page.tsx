import { headers } from "next/headers";
import Link from "next/link";
import { getEventSummary } from "@/lib/couple/dashboard";
import { getMiniEventTables } from "@/lib/couple/mini-event";
import { listAgendaItems } from "@/lib/couple/agenda";
import { listChecklistItems, computeChecklistStats } from "@/lib/couple/checklist";
import { EventHeroCard } from "@/components/couple/EventHeroCard";
import { ContactInfoEditor } from "@/components/couple/ContactInfoEditor";
import { Icon } from "@/components/venue/shell/Icon";
import { StorageMeter } from "@/components/couple/StorageMeter";
import { getStorageUsage } from "@/lib/media/album";
import { formatMkDate, todayIn } from "@/lib/date";
import { coupleDeadlineText } from "@/lib/rsvp-deadline";
import { ChangeNotice } from "@/components/couple/ChangeNotice";
import { coupleNotice } from "@/lib/changes/couple-notice";
import { loadCoupleMarks, NO_MARKS } from "@/lib/couple/change-marks";
import { eventStartInstant, eventEndInstant } from "@/lib/couple/event-hero";
import { COUPLE_DOWNLOADS_HREF } from "@/lib/couple/access";
import { getGuestStats } from "@/lib/couple/guests";
import { menusChangedText } from "@/lib/couple/guest-menus";

export const dynamic = "force-dynamic";

export default async function CoupleDashboardPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [summary, agendaItems, checklistItems, storage, marks, guestStats] = await Promise.all([
    getEventSummary(eventId),
    listAgendaItems(eventId),
    listChecklistItems(eventId),
    // The meter is optional here: if the plan cannot be read, it is left out.
    getStorageUsage(eventId).catch(() => null),
    // The boxes are a hint: the page works without them.
    loadCoupleMarks(eventId).catch((e) => {
      console.error("Could not load the change marks", e);
      return NO_MARKS;
    }),
    // 0181: the confirmed count next to the estimate, and the menu warning — hints too.
    getGuestStats(eventId).catch((e) => {
      console.error("Could not load the guest numbers", e);
      return null;
    }),
  ]);
  // Project B §3: a mini-event never gets a seating editor — this read-only
  // line is the entire "seating" story for one, so it's only ever fetched
  // when actually needed.
  const miniTables = summary.seating_mode === "mini" ? await getMiniEventTables(eventId) : null;
  const notices = (["date_time", "rooms", "guest_count", "contact"] as const).flatMap((section) => {
    const notice = coupleNotice(section, marks.unseen[section]);
    return notice ? [notice] : [];
  });
  const checklistStats = computeChecklistStats(checklistItems);
  const upcomingAgenda = agendaItems.slice(0, 5);
  const openChecklist = checklistItems.filter((i) => !i.is_done).slice(0, 5);
  // 0180: the venue's deadline for the guests' answers.
  const deadlineText = coupleDeadlineText({ deadline: summary.rsvp_deadline, eventDate: summary.event_date, status: summary.status, today: todayIn() });

  return (
    <main style={{ padding: "18px 22px 28px" }}>
      {notices.map((n) => (
        <ChangeNotice key={n.section} {...n} />
      ))}
      <EventHeroCard
        coupleNames={summary.couple_names}
        eventDate={summary.event_date}
        startIso={eventStartInstant(summary.event_date, summary.start_time).toISOString()}
        endIso={eventEndInstant(summary.event_date, summary.start_time, summary.end_time).toISOString()}
        startTime={summary.start_time}
        endTime={summary.end_time}
        venueName={summary.venue_name}
        guestCount={summary.guest_count_estimate}
        confirmed={guestStats ? { people: guestStats.totalAttending, children: guestStats.childrenAttending } : null}
      />

      {guestStats && guestStats.menuRechoose > 0 ? (
        <div role="status" className="change-box" style={{ marginBottom: 16 }}>
          <b>{menusChangedText(guestStats.menuRechoose)}</b>{" "}
          <Link href="/couple/guests?menu=none" style={{ color: "#8a6a22" }}>
            Прикажи ги →
          </Link>
        </div>
      ) : null}

      {deadlineText ? (
        <p className="ev-hint" style={{ margin: "0 0 16px" }}>
          {deadlineText}{" "}
          <Link href="/couple/guests" style={{ color: "#8a6a22" }}>
            Гости →
          </Link>
        </p>
      ) : null}

      {miniTables ? (
        <p className="ev-hint" style={{ margin: "0 0 16px" }}>
          {miniTables.tableLabels.length > 0
            ? `Вашите маси во ${miniTables.roomName}: ${miniTables.tableLabels.join(", ")}.`
            : `Локалот сè уште не доделил маси во ${miniTables.roomName}.`}{" "}
          За промени, контактирајте го локалот.
        </p>
      ) : null}

      {/* C5: the album's space, once guests have started sharing. */}
      {storage && storage.photoBytes + storage.videoBytes > 0 && (
        <div style={{ marginBottom: 16 }}>
          <StorageMeter usage={storage} />
        </div>
      )}

      <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2" style={{ marginBottom: 16 }}>
        <section className="panel couple-card">
          <div className="panel-h">
            <h2 className="panel-t"><Icon name="cal-dot" size="sm" /> Агенда</h2>
          </div>
          {upcomingAgenda.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13.5, padding: "8px 14px 14px", margin: 0 }}>
              Сè уште нема испланирано ништо.
            </p>
          ) : (
            <div style={{ padding: "8px 14px 14px" }}>
              {upcomingAgenda.map((item) => (
                <div key={item.id} className="up-row">
                  <span>
                    <b>{item.title}</b>
                    <span>{item.time ? item.time.slice(0, 5) : "Нема поставено време"}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ padding: "0 14px 14px" }}>
            <Link href="/couple/agenda" style={{ color: "#8a6a22", fontSize: 13.5 }}>
              Погледни ги сите →
            </Link>
          </div>
        </section>

        <section className="panel couple-card">
          <div className="panel-h">
            <h2 className="panel-t"><Icon name="check" size="sm" /> Чеклиста</h2>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13.5, padding: "8px 14px 0", margin: 0 }}>
            {checklistStats.open === 0
              ? "Сè е завршено"
              : `${checklistStats.open} отворени${checklistStats.overdue > 0 ? ` · ${checklistStats.overdue} задоцнети` : ""}`}
          </p>
          {openChecklist.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13.5, padding: "8px 14px 14px", margin: 0 }}>
              Нема преостанато ништо за правење.
            </p>
          ) : (
            <div style={{ padding: "8px 14px 14px" }}>
              {openChecklist.map((item) => (
                <div key={item.id} className="up-row">
                  <span>
                    <b>{item.title}</b>
                    {item.due_date ? <span>Рок {formatMkDate(item.due_date)}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ padding: "0 14px 14px" }}>
            <Link href="/couple/checklist" style={{ color: "#8a6a22", fontSize: 13.5 }}>
              Погледни ги сите →
            </Link>
          </div>
        </section>
      </div>

      {/* Group A task 7: the keepsake download, any time before or after the day. */}
      <section className="panel couple-card" style={{ marginBottom: 16 }}>
        <div className="panel-h">
          <h2 className="panel-t"><Icon name="book" size="sm" /> {summary.event_type === "wedding" ? "Преземи ја вашата свадба" : "Преземете го вашиот настан"}</h2>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13.5, padding: "8px 14px 0", margin: 0 }}>
          Книга со поканата, гостите, честитките и буџетот, табели за Excel и сите фотографии и видеа — ваши засекогаш.
        </p>
        <div style={{ padding: "10px 14px 14px" }}>
          <Link href={COUPLE_DOWNLOADS_HREF} style={{ color: "#8a6a22", fontSize: 13.5 }}>
            Преземи →
          </Link>
        </div>
      </section>

      <ContactInfoEditor
        contactEmail={summary.contact_email}
        contactEmail2={summary.contact_email_2}
        contactPhone={summary.contact_phone}
      />
    </main>
  );
}
