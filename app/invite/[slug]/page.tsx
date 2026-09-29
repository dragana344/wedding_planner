import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvitationBySlug, getInvitationPhotoUrl } from "@/lib/couple/invitations";
import { FullInvitation } from "@/components/invite/FullInvitation";

// Private area: keep out of search engines (COMP-004).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function PublicInvitationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const invitation = await getInvitationBySlug(slug);
  if (!invitation) notFound();

  const photoUrl = getInvitationPhotoUrl(invitation.photo_path);

  return (
    <>
      <FullInvitation slug={slug} invitation={invitation} photoUrl={photoUrl} />
      {/* COMP-001: guests are data subjects too. */}
      <p style={{ textAlign: "center", fontSize: 12, padding: "16px 0 24px", margin: 0 }}>
        <Link href="/privacy" style={{ color: "#6b6357" }}>
          Политика за приватност
        </Link>
      </p>
    </>
  );
}
