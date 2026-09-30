import { TableQrCards } from "@/components/seating/print/TableQrCards";
import { printSerif } from "@/components/seating/print/font";
import { venuePrintData } from "@/lib/seating/print-data";
import { staffPrintAccess } from "../access";

export const dynamic = "force-dynamic";

export default async function VenuePrintQrPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { supabase, origin } = await staffPrintAccess(eventId);
  const data = await venuePrintData(supabase, eventId, origin);
  return (
    <TableQrCards title={data.title} hint="Скенирај за поканата" cards={data.cards} fontClassName={printSerif.variable} backHref="/venue/events" />
  );
}
