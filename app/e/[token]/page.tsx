import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAlbumByToken } from "@/lib/media/album";
import { GuestAlbum } from "@/components/album/GuestAlbum";
import { getEventFeatures } from "@/lib/entitlements/server";
import "@/components/album/guest-album.css";

// The guests' QR page (C1, C2): no login, the token in the link is the key.
export const metadata: Metadata = { title: "Споделете ги вашите фотографии", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

const MK_MONTHS = ["јануари", "февруари", "март", "април", "мај", "јуни", "јули", "август", "септември", "октомври", "ноември", "декември"];

function longDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MK_MONTHS[month - 1]} ${year}`;
}

export default async function GuestAlbumPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const album = /^[A-Za-z0-9_-]{22,64}$/.test(token) ? await getAlbumByToken(token) : null;
  if (!album) notFound();
  // The package decides which parts guests see; the API refuses the rest too.
  // If the package can't be read, guests get the friendly locked card rather
  // than an error page (the API fails closed the same way).
  const features = await getEventFeatures(album.eventId).catch(() => null);

  return (
    <main className="ga-page">
      <header className="ga-header">
        <p className="ga-kicker">Албум</p>
        <h1 className="ga-title">{album.coupleNames}</h1>
        <p className="ga-date">
          {longDate(album.eventDate)}
          {album.venueName ? ` · ${album.venueName}` : ""}
        </p>
      </header>
      <GuestAlbum
        token={token}
        features={{
          photos: features?.photo_album.enabled ?? false,
          greetings: features?.guest_greetings.enabled ?? false,
          video: features?.video_greetings.enabled ?? false,
        }}
      />
      <p className="ga-footer">
        <Link href="/privacy">Политика за приватност</Link>
      </p>
    </main>
  );
}
