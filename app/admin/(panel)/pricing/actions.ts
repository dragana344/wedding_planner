"use server";

// Thin Server Action wrappers, same shape as ../plans/actions.ts: every
// export must be `adminAction(...)` (tests/security/admin-static.test.ts).

import { adminAction } from "@/lib/admin/actions";
import { pricingActionCore as core, pricingSchemas as schemas } from "@/lib/admin/pricing-actions-core";

export const createPricingCard = adminAction(schemas.create, core.create);
export const updatePricingCard = adminAction(schemas.update, core.update);
export const deletePricingCard = adminAction(schemas.id, core.remove);
