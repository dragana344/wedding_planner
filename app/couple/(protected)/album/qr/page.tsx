import { headers } from "next/headers";
import { getOrCreateAlbumToken } from "@/lib/media/album";
import { getEventSummary } from "@/lib/couple/dashboard";
import { parsePrintDesign } from "@/lib/media/print-designs";
import { AlbumQrPrint } from "@/components/couple/AlbumQrPrint";
import { parsePrintOptions } from "@/lib/media/print-options";
import "@/components/couple/album-print.css";

export const dynamic = "force-dynamic";

export default async function AlbumQrPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const params = await searchParams;
  const [token, summary] = await Promise.all([getOrCreateAlbumToken(eventId), getEventSummary(eventId)]);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <AlbumQrPrint
        guestPath={`/e/${token}`}
        options={parsePrintOptions(params)}
        eventType={summary.event_type}
        design={parsePrintDesign(params, summary.event_type)}
      />
    </main>
  );
}
