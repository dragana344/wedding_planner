import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireManagerForEvent } from "@/lib/venue/event-guard";
import { deleteShowcasePhoto } from "@/lib/venue/showcase";
import { withPublic } from "@/lib/api/handler";
import { uuid } from "@/lib/api/schemas";

// Removes one showcase photo (manager-only, 0109); 0038's trigger queues its file.

export const DELETE = withPublic(
  async ({ request, params }) => {
    const guard = await requireManagerForEvent(request, params.eventId);
    if (guard instanceof NextResponse) return guard;
    if (!(await deleteShowcasePhoto(params.eventId, params.photoId, createServiceRoleClient()))) {
      return NextResponse.json({ error: "Фотографијата не е пронајдена." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  },
  { params: z.object({ eventId: uuid, photoId: uuid }), fallbackError: "Не успеа бришењето на фотографијата." },
);
