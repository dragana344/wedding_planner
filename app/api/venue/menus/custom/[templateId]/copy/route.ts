import { NextResponse } from "next/server";
import { z } from "zod";
import { withPublic } from "@/lib/api/handler";
import { uuid } from "@/lib/api/schemas";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  requireManagerVenue,
  runCustomMenuAction,
} from "@/lib/venue/custom-menu-guard";
import { copyCustomMenuToPackage } from "@/lib/venue/event-custom-menu";

// Turns an event's custom menu into a standard package (manager-only).
export const POST = withPublic(
  async ({ request, params }) => {
    const guard = await requireManagerVenue(request);
    if (guard instanceof NextResponse) return guard;
    return runCustomMenuAction(() =>
      copyCustomMenuToPackage(
        createServiceRoleClient(),
        guard.venueId,
        params.templateId,
      ),
    );
  },
  {
    params: z.object({ templateId: uuid }),
    fallbackError: "Не успеа создавањето на пакетот.",
  },
);
