"use server";

// Thin Server Action wrappers: guard → validate → run → audit is
// adminAction's job (lib/admin/actions.ts); this module only wires each
// schema/core-function pair from lib/admin/venue-actions-core.ts. Every
// export must be `adminAction(...)` — tests/security/admin-static.test.ts
// enforces the shape.

import { adminAction } from "@/lib/admin/actions";
import { venueActionCore as core, venueSchemas as schemas } from "@/lib/admin/venue-actions-core";

export const renameVenue = adminAction(schemas.rename, core.rename);
export const setVenuePlan = adminAction(schemas.setPlan, core.setPlan);
export const saveVenueOverride = adminAction(schemas.saveOverride, core.saveOverride);
export const blockVenue = adminAction(schemas.block, core.block);
export const unblockVenue = adminAction(schemas.unblock, core.unblock);
export const deleteVenue = adminAction(schemas.remove, core.remove);
export const sendStaffPasswordReset = adminAction(schemas.staff, core.staffPasswordReset);
export const removeStaffMfa = adminAction(schemas.staff, core.staffRemoveMfa);
export const signOutStaff = adminAction(schemas.staff, core.staffSignOut);
