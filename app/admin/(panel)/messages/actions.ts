"use server";

// Thin Server Action wrappers: guard → validate → run → audit is
// adminAction's job (lib/admin/actions.ts); this module only wires each
// schema/core-function pair from lib/admin/message-actions-core.ts. Every
// export must be `adminAction(...)` — tests/security/admin-static.test.ts
// enforces the shape.

import { adminAction } from "@/lib/admin/actions";
import { messageActionCore as core, messageSchemas as schemas } from "@/lib/admin/message-actions-core";

export const setMessageStatus = adminAction(schemas.setStatus, core.setStatus);
export const deleteMessage = adminAction(schemas.id, core.remove);
