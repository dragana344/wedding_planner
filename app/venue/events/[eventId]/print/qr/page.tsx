import { TableQrCards } from "@/components/seating/print/TableQrCards";
import { LockedBanner } from "@/components/entitlements/LockedBanner";
import { printSerif } from "@/components/seating/print/font";
import { venuePrintData } from "@/lib/seating/print-data";
import { staffPrintAccess } from "../access";

export const dynamic = "force-dynamic";

export default async function VenuePrintQrPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { supabase, origin } = await staffPrintAccess(eventId);
  const data = await venuePrintData(supabase, eventId, origin);
  if (data.qrLocked) return <LockedBanner audience="venue" />;
  return (
    <TableQrCards title={data.title} hint="Скенирај: каде седам, програма" cards={data.cards} fontClassName={printSerif.variable} backHref="/venue/events" />
  );
}
