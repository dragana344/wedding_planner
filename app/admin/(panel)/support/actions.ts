"use server";

// Thin Server Action wrappers: guard → validate → run → audit is
// adminAction's job (lib/admin/actions.ts); this module only wires each
// schema/core-function pair from lib/admin/task-actions-core.ts. Every
// export must be `adminAction(...)` — tests/security/admin-static.test.ts
// enforces the shape.

import { adminAction } from "@/lib/admin/actions";
import { adminTaskActionCore as core, adminTaskSchemas as schemas } from "@/lib/admin/task-actions-core";

export const createAdminTask = adminAction(schemas.create, core.create);
export const setAdminTaskStatus = adminAction(schemas.setStatus, core.setStatus);
export const commentOnAdminTask = adminAction(schemas.comment, core.comment);
export const deleteAdminTask = adminAction(schemas.id, core.remove);
