"use server";

// Thin Server Action wrapper: guard → validate → run → audit is
// adminAction's job (lib/admin/actions.ts); this module only wires the
// schema/core-function pair from lib/admin/message-actions-core.ts. Every
// export must be `adminAction(...)` — tests/security/admin-static.test.ts
// enforces the shape.

import { adminAction } from "@/lib/admin/actions";
import { messageActionCore as core, messageSchemas as schemas } from "@/lib/admin/message-actions-core";

export const setMaintenanceMode = adminAction(schemas.maintenance, core.setMaintenance);
