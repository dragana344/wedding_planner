"use server";

// Thin Server Action wrappers, same shape as ../pricing/actions.ts: every
// export must be `adminAction(...)` (tests/security/admin-static.test.ts).

import { adminAction } from "@/lib/admin/actions";
import { vendorPartnerActionCore as core, vendorPartnerSchemas as schemas } from "@/lib/admin/vendor-partners-actions-core";

export const createVendorPartner = adminAction(schemas.create, core.create);
export const updateVendorPartner = adminAction(schemas.update, core.update);
export const deleteVendorPartner = adminAction(schemas.id, core.remove);
export const uploadVendorPartnerPhoto = adminAction(schemas.uploadPhoto, core.uploadPhoto);
export const removeVendorPartnerGalleryPhoto = adminAction(schemas.removeGalleryPhoto, core.removeGalleryPhoto);
