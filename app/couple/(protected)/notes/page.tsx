import { headers } from "next/headers";
import { listNotes } from "@/lib/couple/notes";
import { NotesClient } from "@/components/couple/NotesClient";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const notes = await listNotes(eventId);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <NotesClient initialNotes={notes} />
    </main>
  );
}
