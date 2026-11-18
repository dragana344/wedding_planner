import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { getContactMessage } from "@/lib/admin/queries";
import { BackButton } from "@/components/admin/BackButton";
import { ContactMessageActions } from "@/components/admin/InboxDetails";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_PILL } from "@/lib/support/status";

export const dynamic = "force-dynamic";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("mk-MK", { timeZone: "Europe/Skopje", hourCycle: "h23" });
}

// A public contact-form message: the platform's own data (spec §5 item 5),
// so name/email/message are shown — see tests/security/admin-static.test.ts.
export default async function ContactMessagePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ page: true });
  const { id } = await params;
  const message = await getContactMessage(id);
  if (!message) notFound();
  return (
    <div className="wrap">
      <BackButton label="Назад кон пораки" />
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">{message.kind === "demo" ? "Барање за демо" : "Порака од јавната форма"}</h2>
          <span className={`pill ${SUPPORT_STATUS_PILL[message.status]}`}>{SUPPORT_STATUS_LABEL[message.status]}</span>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0 }}>
            <strong>{message.name}</strong> · {message.email} · <span className="muted">{formatDateTime(message.createdAt)}</span>
          </p>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{message.message}</p>
          <p className="muted" style={{ margin: 0 }}>
            Испраќачот нема профил во апликацијата — одговорете по е-пошта, па означете ја пораката.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn btn-gold" href={`mailto:${encodeURIComponent(message.email)}`}>
              Одговори по е-пошта
            </a>
            <ContactMessageActions message={message} />
          </div>
        </div>
      </section>
    </div>
  );
}
