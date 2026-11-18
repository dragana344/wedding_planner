import { headers } from "next/headers";
import { getOrCreateAlbumToken, getStorageUsage } from "@/lib/media/album";
import { listPhotoFiles, listPhotos } from "@/lib/media/photos";
import { planZipParts } from "@/lib/media/zip";
import { AlbumClient } from "@/components/couple/AlbumClient";
import { downloadPin } from "@/lib/media/download-pin";

export const dynamic = "force-dynamic";

const PAGE = 60;

export default async function AlbumPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  // The ZIP part links carry this moment, so each part is planned from the same photos.
  const before = downloadPin();
  const [token, photos, usage, files] = await Promise.all([
    getOrCreateAlbumToken(eventId),
    listPhotos(eventId, { includeHidden: true, limit: PAGE + 1 }),
    getStorageUsage(eventId),
    listPhotoFiles(eventId, before),
  ]);

  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <AlbumClient
        initialPhotos={photos.slice(0, PAGE)}
        hasMore={photos.length > PAGE}
        usage={usage}
        zipParts={planZipParts(files).length}
        zipBefore={before}
        guestPath={`/e/${token}`}
      />
    </main>
  );
}
