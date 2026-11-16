import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { getInboxTicket } from "@/lib/admin/queries";
import { BackButton } from "@/components/admin/BackButton";
import { AdminTicketThread } from "@/components/admin/InboxDetails";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_PILL } from "@/lib/support/status";

export const dynamic = "force-dynamic";

export default async function InboxTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ page: true });
  const { id } = await params;
  const thread = await getInboxTicket(id);
  if (!thread) notFound();
  const { ticket, messages } = thread;
  return (
    <div className="wrap">
      <BackButton label="Назад кон пораки" />
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">{ticket.problem}</h2>
          <span className={`pill ${SUPPORT_STATUS_PILL[ticket.status]}`}>{SUPPORT_STATUS_LABEL[ticket.status]}</span>
        </div>
        <p className="muted" style={{ margin: 0, padding: "12px 20px 0" }}>
          {ticket.submittedBy === "couple" ? `Пар: ${ticket.coupleNames ?? "—"} · ` : "Локал · "}
          {ticket.venueName} · испратил/а {ticket.name}
        </p>
        <AdminTicketThread ticket={ticket} messages={messages} />
      </section>
    </div>
  );
}
