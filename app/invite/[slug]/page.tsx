import { notFound } from "next/navigation";
import { getInvitationBySlug, getInvitationPhotoUrl } from "@/lib/couple/invitations";
import { getInvitationTemplate } from "@/lib/couple/invitation-templates";
import { RsvpForm } from "@/components/invite/RsvpForm";

export const dynamic = "force-dynamic";

export default async function PublicInvitationPage({ params }: { params: { slug: string } }) {
  const invitation = await getInvitationBySlug(params.slug);
  if (!invitation) notFound();

  const template = getInvitationTemplate(invitation.template_id);
  const photoUrl = getInvitationPhotoUrl(invitation.photo_path);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-8 py-16 text-center">
      <div className="w-full rounded-3xl border p-10 shadow-sm" style={{ borderColor: template.accentColor, borderWidth: 2 }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="mx-auto mb-6 h-40 w-40 rounded-full object-cover" />
        ) : null}
        <p className="font-display text-3xl" style={{ color: template.accentColor }}>
          {invitation.couple_names}
        </p>
        <p className="mt-2 text-neutral-600">{invitation.event_date}</p>
        <p className="text-neutral-600">
          {invitation.venue_name}
          {invitation.room_names.length > 0 ? ` — ${invitation.room_names.join(", ")}` : ""}
        </p>
        {invitation.message ? <p className="mt-6 text-neutral-700">{invitation.message}</p> : null}

        <RsvpForm slug={params.slug} accentColor={template.accentColor} />
      </div>
    </main>
  );
}
