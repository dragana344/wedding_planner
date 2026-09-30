"use server";

// Thin Server Action wrappers: guard → validate → run → audit is
// adminAction's job (lib/admin/actions.ts); this module only wires each
// schema/core-function pair from lib/admin/event-actions-core.ts. Every
// export must be `adminAction(...)` — tests/security/admin-static.test.ts
// enforces the shape.

import { adminAction } from "@/lib/admin/actions";
import { eventActionCore as core, eventSchemas as schemas } from "@/lib/admin/event-actions-core";

export const updateEvent = adminAction(schemas.update, core.update);
export const saveEventOverride = adminAction(schemas.saveOverride, core.saveOverride);
export const unlockCoupleLogin = adminAction(schemas.id, core.unlockCouple);
export const regenerateCouplePassword = adminAction(schemas.id, core.regenerateCouplePassword);
