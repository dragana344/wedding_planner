// app/api/couple/notes/[id]/route.ts
import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { idParams, noteBody } from "@/lib/api/schemas";
import { updateNote, deleteNote } from "@/lib/couple/notes";

export const PATCH = withCoupleEvent(
  async ({ eventId, params, body }) => {
    const updated = await updateNote(eventId, params.id, { title: body.title || null, content: body.content ?? "" });
    return NextResponse.json(updated);
  },
  { feature: "notes", params: idParams, body: noteBody, fallbackError: "Не успеа зачувувањето на белешката." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, params }) => {
    await deleteNote(eventId, params.id);
    return NextResponse.json({ ok: true });
  },
  { feature: "notes", params: idParams, fallbackError: "Не успеа бришењето на белешката." },
);
