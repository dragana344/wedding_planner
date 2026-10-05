import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getInvitationBySlug, getInvitationPhotoUrl } from "@/lib/couple/invitations";
import { getInviteeByToken } from "@/lib/couple/rsvp";
import { getSeatByToken } from "@/lib/couple/guest-page";
import { FullInvitation } from "@/components/invite/FullInvitation";

// One read per request, shared by the metadata and the page.
const loadInvitation = cache(getInvitationBySlug);

const MK_MONTHS = ["јануари", "февруари", "март", "април", "мај", "јуни", "јули", "август", "септември", "октомври", "ноември", "декември"];

// What a messaging app shows when the couple shares the link: the couple's
// names, the date and the venue, and their photo if they added one. Still
// kept out of search engines (COMP-004).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const robots = { index: false, follow: false };
  const { slug } = await params;
  const invitation = await loadInvitation(slug);
  if (!invitation) return { title: "Покана", robots };
  const [year, month, day] = invitation.event_date.split("-").map(Number);
  const when = `${day} ${MK_MONTHS[month - 1]} ${year}${invitation.start_time ? ` во ${invitation.start_time.slice(0, 5)}` : ""}`;
  const title = `Покана — ${invitation.couple_names}`;
  const description = `${when}, ${invitation.venue_name}. Отворете ја поканата и потврдете го вашето доаѓање.`;
  const photoUrl = getInvitationPhotoUrl(invitation.photo_path);
  return {
    title,
    description,
    robots,
    openGraph: { title, description, type: "website", locale: "mk_MK", ...(photoUrl ? { images: [photoUrl] } : {}) },
  };
}

export const dynamic = "force-dynamic";

export default async function PublicInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ g?: string | string[] }>;
}) {
  const { slug } = await params;
  const { g } = await searchParams;
  const invitation = await loadInvitation(slug);
  if (!invitation) notFound();

  // A1: `?g=<token>` is the guest's personal link. A wrong token, or one from
  // another event, just shows the shared invitation.
  const guestToken = typeof g === "string" ? g : undefined;
  const invitee = guestToken ? await getInviteeByToken(slug, guestToken) : null;
  // A15: the guest's own table on their personal page.
  const mySeat = invitee && guestToken ? await getSeatByToken(slug, guestToken) : undefined;

  const photoUrl = getInvitationPhotoUrl(invitation.photo_path);

  return (
    <>
      <FullInvitation
        slug={slug}
        invitation={invitation}
        photoUrl={photoUrl}
        invitee={invitee}
        guestToken={invitee ? guestToken : undefined}
        mySeat={mySeat}
      />
      {/* COMP-001: guests are data subjects too. */}
      <p style={{ textAlign: "center", fontSize: 12, padding: "16px 0 24px", margin: 0 }}>
        <Link href="/privacy" style={{ color: "#6b6357" }}>
          Политика за приватност
        </Link>
      </p>
    </>
  );
}
