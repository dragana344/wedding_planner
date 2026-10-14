"use server";

// Thin Server Action wrapper: guard → validate → run → audit is
// adminAction's job (lib/admin/actions.ts); this module only wires the
// schema/core-function pair from lib/admin/support-actions-core.ts.

import { adminAction } from "@/lib/admin/actions";
import { supportTicketActionCore as core, supportTicketSchemas as schemas } from "@/lib/admin/support-actions-core";

export const setSupportTicketStatus = adminAction(schemas.setStatus, core.setStatus);
