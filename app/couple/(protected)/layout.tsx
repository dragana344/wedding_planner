import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getEventSummary } from "@/lib/couple/dashboard";
import { CoupleShell } from "@/components/couple/shell/CoupleShell";
import "@/app/venue/panel.css";

export default async function CoupleLayout({ children }: { children: React.ReactNode }) {
  const eventId = (await headers()).get("x-couple-event-id");
  if (!eventId) redirect("/couple/login");

  const summary = await getEventSummary(eventId);

  return (
    <CoupleShell coupleNames={summary.couple_names} eventDate={summary.event_date} rooms={summary.rooms}>
      {children}
    </CoupleShell>
  );
}
