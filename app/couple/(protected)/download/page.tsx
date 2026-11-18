import { headers } from "next/headers";
import { getEventSummary } from "@/lib/couple/dashboard";
import { COUPLE_ACCESS_PHASE_HEADER } from "@/lib/couple/access";
import { planKeepsakeMedia } from "@/lib/couple/keepsake/media";
import { DownloadsView } from "@/components/couple/DownloadsView";
import { downloadPin } from "@/lib/media/download-pin";

export const dynamic = "force-dynamic";

// Group A task 7: "Преземи ја вашата свадба" (COUPLE_DOWNLOADS_HREF).
export default async function DownloadPage() {
  const requestHeaders = await headers();
  const eventId = requestHeaders.get("x-couple-event-id")!;
  const memories = requestHeaders.get(COUPLE_ACCESS_PHASE_HEADER) === "memories";
  // The part links carry this moment, so each part is planned from the same files.
  const before = downloadPin();
  const [summary, parts] = await Promise.all([getEventSummary(eventId), planKeepsakeMedia(eventId, before)]);
  const files = parts.flat();
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <DownloadsView
        isWedding={summary.event_type === "wedding"}
        accessEnd={memories ? summary.access_end : null}
        media={{
          before,
          parts: parts.map((part) => part.reduce((sum, f) => sum + f.bytes, 0)),
          albumCount: files.filter((f) => f.kind === "album").length,
          greetingVideoCount: files.filter((f) => f.kind === "greeting").length,
          hasInvitationPhoto: files.some((f) => f.kind === "invitation"),
        }}
      />
    </main>
  );
}
