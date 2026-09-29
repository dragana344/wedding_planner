import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvitationBySlug, getInvitationPhotoUrl } from "@/lib/couple/invitations";
import { getInviteeByToken } from "@/lib/couple/rsvp";
import { FullInvitation } from "@/components/invite/FullInvitation";

// Private area: keep out of search engines (COMP-004).
export const metadata: Metadata = { robots: { index: false, follow: false } };

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
  const invitation = await getInvitationBySlug(slug);
  if (!invitation) notFound();

  // A1: `?g=<token>` is the guest's personal link. A wrong token, or one from
  // another event, just shows the shared invitation.
  const guestToken = typeof g === "string" ? g : undefined;
  const invitee = guestToken ? await getInviteeByToken(slug, guestToken) : null;

  const photoUrl = getInvitationPhotoUrl(invitation.photo_path);

  return (
    <>
      <FullInvitation
        slug={slug}
        invitation={invitation}
        photoUrl={photoUrl}
        invitee={invitee}
        guestToken={invitee ? guestToken : undefined}
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
