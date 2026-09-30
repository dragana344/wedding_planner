import { headers } from "next/headers";
import { PrintPlan } from "@/components/seating/print/PrintPlan";
import { TableQrCards } from "@/components/seating/print/TableQrCards";
import { LockedBanner } from "@/components/entitlements/LockedBanner";
import { printSerif } from "@/components/seating/print/font";
import { couplePrintData } from "@/lib/seating/print-data";
import { requestOrigin } from "@/lib/request-origin";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** The couple's own plan (their draft) and table QR cards, ready to print. */
export default async function CouplePrintPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const { view } = await searchParams;
  const data = await couplePrintData(eventId, await requestOrigin());
  if (view === "qr") {
    if (data.qrLocked) return <LockedBanner audience="couple" />;
    return <TableQrCards title={data.title} hint="Скенирај: каде седам, програма" cards={data.cards} fontClassName={printSerif.variable} backHref="/couple/seating/print" />;
  }
  return (
    <>
      <PrintPlan title={data.title} subtitle={data.subtitle} logoUrl={data.logoUrl} rooms={data.rooms} fontClassName={printSerif.variable} backHref="/couple" />
      {data.qrLocked ? null : (
        <p style={{ textAlign: "center", paddingBottom: 32 }} className="s3-no-print">
          <Link href="/couple/seating/print?view=qr">QR картички за масите →</Link>
        </p>
      )}
    </>
  );
}
