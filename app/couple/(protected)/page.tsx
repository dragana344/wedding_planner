import { headers } from "next/headers";
import Link from "next/link";
import { getEventSummary } from "@/lib/couple/dashboard";
import { listAgendaItems } from "@/lib/couple/agenda";
import { listChecklistItems, computeChecklistStats } from "@/lib/couple/checklist";
import { GuestCountEditor } from "@/components/couple/GuestCountEditor";
import { ContactInfoEditor } from "@/components/couple/ContactInfoEditor";

export const dynamic = "force-dynamic";

export default async function CoupleDashboardPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [summary, agendaItems, checklistItems] = await Promise.all([
    getEventSummary(eventId),
    listAgendaItems(eventId),
    listChecklistItems(eventId),
  ]);
  const checklistStats = computeChecklistStats(checklistItems);
  const upcomingAgenda = agendaItems.slice(0, 5);
  const openChecklist = checklistItems.filter((i) => !i.is_done).slice(0, 5);

  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h">
          <h2 className="panel-t">Your event</h2>
        </div>
        <div style={{ padding: "8px 14px 14px" }}>
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>{summary.venue_name}</p>
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>{summary.event_date}</p>
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>
            {summary.rooms.map((r) => r.name).join(", ") || "No room assigned yet"}
          </p>
          <GuestCountEditor initialValue={summary.guest_count_estimate} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" style={{ marginBottom: 16 }}>
        <section className="panel">
          <div className="panel-h">
            <h2 className="panel-t">Agenda</h2>
          </div>
          {upcomingAgenda.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13.5, padding: "8px 14px 14px", margin: 0 }}>
              Nothing planned yet.
            </p>
          ) : (
            <div style={{ padding: "8px 14px 14px" }}>
              {upcomingAgenda.map((item) => (
                <div key={item.id} className="up-row">
                  <span>
                    <b>{item.title}</b>
                    <span>{item.time ?? "No time set"}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ padding: "0 14px 14px" }}>
            <Link href="/couple/agenda" style={{ color: "var(--gold-lo)", fontSize: 13.5 }}>
              View all →
            </Link>
          </div>
        </section>

        <section className="panel">
          <div className="panel-h">
            <h2 className="panel-t">Checklist</h2>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13.5, padding: "8px 14px 0", margin: 0 }}>
            {checklistStats.open === 0
              ? "All done"
              : `${checklistStats.open} open${checklistStats.overdue > 0 ? ` · ${checklistStats.overdue} overdue` : ""}`}
          </p>
          {openChecklist.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13.5, padding: "8px 14px 14px", margin: 0 }}>
              Nothing left to do.
            </p>
          ) : (
            <div style={{ padding: "8px 14px 14px" }}>
              {openChecklist.map((item) => (
                <div key={item.id} className="up-row">
                  <span>
                    <b>{item.title}</b>
                    {item.due_date ? <span>Due {item.due_date}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ padding: "0 14px 14px" }}>
            <Link href="/couple/checklist" style={{ color: "var(--gold-lo)", fontSize: 13.5 }}>
              View all →
            </Link>
          </div>
        </section>
      </div>

      <ContactInfoEditor
        contactEmail={summary.contact_email}
        contactEmail2={summary.contact_email_2}
        contactPhone={summary.contact_phone}
      />
    </main>
  );
}
