import { headers } from "next/headers";
import { getOrCreateAlbumToken, getStorageUsage } from "@/lib/media/album";
import { listPhotoFiles, listPhotos } from "@/lib/media/photos";
import { planZipParts } from "@/lib/media/zip";
import { AlbumClient } from "@/components/couple/AlbumClient";

export const dynamic = "force-dynamic";

const PAGE = 60;

export default async function AlbumPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [token, photos, usage, files] = await Promise.all([
    getOrCreateAlbumToken(eventId),
    listPhotos(eventId, { includeHidden: true, limit: PAGE + 1 }),
    getStorageUsage(eventId),
    listPhotoFiles(eventId),
  ]);

  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <AlbumClient
        initialPhotos={photos.slice(0, PAGE)}
        hasMore={photos.length > PAGE}
        usage={usage}
        zipParts={planZipParts(files).length}
        guestPath={`/e/${token}`}
      />
    </main>
  );
}
