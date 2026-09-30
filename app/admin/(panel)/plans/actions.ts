"use server";

// Thin Server Action wrappers: guard → validate → run → audit is
// adminAction's job (lib/admin/actions.ts); this module only wires each
// schema/core-function pair from lib/admin/plan-actions-core.ts. Every
// export must be `adminAction(...)` — tests/security/admin-static.test.ts
// enforces the shape.

import { adminAction } from "@/lib/admin/actions";
import { planActionCore as core, planSchemas as schemas } from "@/lib/admin/plan-actions-core";

export const createPlan = adminAction(schemas.create, core.create);
export const updatePlan = adminAction(schemas.update, core.update);
export const setPlanFeatures = adminAction(schemas.setFeatures, core.setFeatures);
export const deletePlan = adminAction(schemas.id, core.remove);
export const makeDefaultPlan = adminAction(schemas.id, core.makeDefault);
