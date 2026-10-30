import { NextResponse } from "next/server";
import { z } from "zod";
import { withPublic } from "@/lib/api/handler";
import { uuid } from "@/lib/api/schemas";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  requireManagerVenue,
  runCustomMenuAction,
} from "@/lib/venue/custom-menu-guard";
import { deletePastCustomMenu } from "@/lib/venue/event-custom-menu";

// Removes a past event's custom menu (manager-only).
export const DELETE = withPublic(
  async ({ request, params }) => {
    const guard = await requireManagerVenue(request);
    if (guard instanceof NextResponse) return guard;
    return runCustomMenuAction(() =>
      deletePastCustomMenu(
        createServiceRoleClient(),
        guard.venueId,
        params.templateId,
      ),
    );
  },
  {
    params: z.object({ templateId: uuid }),
    fallbackError: "Не успеа бришењето на менито.",
  },
);
