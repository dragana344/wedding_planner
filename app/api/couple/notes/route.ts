// app/api/couple/notes/route.ts
import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { noteBody } from "@/lib/api/schemas";
import { listNotes, createNote } from "@/lib/couple/notes";

export const GET = withCoupleEvent(
  async ({ eventId }) => NextResponse.json(await listNotes(eventId)),
  { feature: "notes", fallbackError: "Не успеа вчитувањето на белешките." },
);

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const created = await createNote(eventId, { title: body.title || null, content: body.content ?? "" });
    return NextResponse.json(created);
  },
  { feature: "notes", body: noteBody, fallbackError: "Не успеа создавањето на белешката." },
);
