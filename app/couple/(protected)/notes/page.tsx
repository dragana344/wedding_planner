import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { listNotes } from "@/lib/couple/notes";
import { NotesClient } from "@/components/couple/NotesClient";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [notes, { data: event }] = await Promise.all([
    listNotes(eventId),
    createServiceRoleClient().from("events").select("couple_names").eq("id", eventId).single(),
  ]);
  return (
    <main>
      <NotesClient coupleNames={event?.couple_names ?? ""} initialNotes={notes} />
    </main>
  );
}
