import { NextResponse } from "next/server";
import { z } from "zod";
import { withCoupleEvent } from "@/lib/api/handler";
import { confirmInvitationPhotoUpload } from "@/lib/couple/invitations";

// SEC-005 step 2: verify the uploaded file is a real image and attach it.
export const POST = withCoupleEvent(
  async ({ eventId, body }) => NextResponse.json({ photo_path: await confirmInvitationPhotoUpload(eventId, body.path) }),
  {
    body: z.object({ path: z.string().min(1).max(200) }),
    fallbackError: "Не успеа прикачувањето на фотографијата.",
  },
);
