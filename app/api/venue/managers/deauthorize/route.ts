import { NextResponse } from "next/server";
import { deleteManagerElevation } from "@/lib/venue/manager-elevation";
import { withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, managerDeauthorizeBody } from "@/lib/api/schemas";

// Deliberately always 200: revoking a token that's already gone (expired,
// already revoked, never existed) is not an error — the caller's goal
// ("make sure I'm not elevated") is already satisfied either way.
export const POST = withPublic(
  async ({ body }) => {
    await deleteManagerElevation(body.token);
    return NextResponse.json({ ok: true });
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: managerDeauthorizeBody, invalidBodyError: INVALID_JSON_ERROR },
);
