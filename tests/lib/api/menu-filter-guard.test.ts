// @vitest-environment node
//
// Defence in depth for the PostgREST filter built in lib/couple/menu.ts:
// even if a caller skips the route schema, a non-UUID id must be rejected
// before a Supabase client (and therefore any query) is created.
import { describe, it, expect, vi } from "vitest";

const dbAccess = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => {
    dbAccess();
    throw new Error("DB access in a validation test");
  },
}));

import { setEventMenuSelection, setMenuItemQuantities } from "@/lib/couple/menu";

const EVENT = "11111111-1111-4111-8111-111111111111";
const ID = "3f2b8c1e-9a4d-4c2e-8f1a-2b3c4d5e6f70";
const INJECTION = "x),menu_item_id.not.is.null";

describe("lib/couple/menu id guard", () => {
  it("setMenuItemQuantities rejects a non-UUID id before any query", async () => {
    await expect(
      setMenuItemQuantities(EVENT, [
        { menu_item_id: ID, guest_count: 1 },
        { menu_item_id: INJECTION, guest_count: null },
      ]),
    ).rejects.toThrow("Invalid menu item id.");
    expect(dbAccess).not.toHaveBeenCalled();
  });

  it("setEventMenuSelection rejects non-UUID custom item ids and template ids before any query", async () => {
    await expect(setEventMenuSelection(EVENT, { mode: "custom", menuItemIds: [ID, INJECTION] })).rejects.toThrow(
      "Invalid menu item id.",
    );
    await expect(setEventMenuSelection(EVENT, { mode: "template", menuTemplateId: INJECTION })).rejects.toThrow(
      "Invalid menu item id.",
    );
    expect(dbAccess).not.toHaveBeenCalled();
  });
});
