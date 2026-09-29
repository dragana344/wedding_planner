import { headers } from "next/headers";
import { getOrCreateAlbumToken } from "@/lib/media/album";
import { AlbumQrPrint, parsePrintOptions } from "@/components/couple/AlbumQrPrint";
import "@/components/couple/album-print.css";

export const dynamic = "force-dynamic";

export default async function AlbumQrPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const token = await getOrCreateAlbumToken(eventId);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <AlbumQrPrint guestPath={`/e/${token}`} options={parsePrintOptions(await searchParams)} />
    </main>
  );
}
