import { PrintPlan } from "@/components/seating/print/PrintPlan";
import { printSerif } from "@/components/seating/print/font";
import { venuePrintData } from "@/lib/seating/print-data";
import { staffPrintAccess } from "../access";

export const dynamic = "force-dynamic";

export default async function VenuePrintPlanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { supabase, origin } = await staffPrintAccess(eventId);
  const data = await venuePrintData(supabase, eventId, origin);
  return (
    <PrintPlan
      title={data.title}
      subtitle={data.subtitle}
      logoUrl={data.logoUrl}
      rooms={data.rooms}
      fontClassName={printSerif.variable}
      backHref="/venue/events"
    />
  );
}
