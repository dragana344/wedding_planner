import { notFound } from "next/navigation";
import { getInvitationBySlug, getInvitationPhotoUrl } from "@/lib/couple/invitations";
import { FullInvitation } from "@/components/invite/FullInvitation";

export const dynamic = "force-dynamic";

export default async function PublicInvitationPage({ params }: { params: { slug: string } }) {
  const invitation = await getInvitationBySlug(params.slug);
  if (!invitation) notFound();

  const photoUrl = getInvitationPhotoUrl(invitation.photo_path);

  return <FullInvitation slug={params.slug} invitation={invitation} photoUrl={photoUrl} />;
}
