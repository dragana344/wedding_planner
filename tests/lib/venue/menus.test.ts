// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  listMenuTemplates,
  createMenuTemplate,
  addMenuItem,
  deleteMenuTemplate,
  deleteMenuItem,
  listMenuItems,
  listMenuTemplateItems,
  setMenuTemplateItems,
} from "@/lib/venue/menus";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let venueId: string;

describe("menus data layer", () => {
  beforeAll(async () => {
    const { data } = await admin.from("venues").insert({ name: "Menus Test Venue" }).select().single();
    venueId = data!.id;
  });

  afterAll(async () => {
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("adds items to the venue's shared pool, tagged by tier", async () => {
    const item = await addMenuItem({
      venue_id: venueId,
      tiers: ["special"],
      course: "main",
      name: "Grilled chicken",
      allergen_tags: ["gluten"],
      is_vegetarian: false,
      is_vegan: false,
      price: 12.5,
    });
    expect(item.price).toBe(12.5);
    expect(item.photo_path).toBeNull();
    expect(item.tiers).toEqual(["special"]);

    const everydayItem = await addMenuItem({
      venue_id: venueId,
      tiers: ["everyday"],
      course: "starter",
      name: "House salad",
      allergen_tags: [],
      is_vegetarian: true,
      is_vegan: true,
      price: 4,
    });

    const special = await listMenuItems(venueId, "special");
    expect(special.some((i) => i.id === item.id)).toBe(true);
    expect(special.some((i) => i.id === everydayItem.id)).toBe(false);

    const everyday = await listMenuItems(venueId, "everyday");
    expect(everyday.some((i) => i.id === everydayItem.id)).toBe(true);

    await deleteMenuItem(item.id);
    await deleteMenuItem(everydayItem.id);
  });

  it("lets a single item belong to both the everyday and special menus at once", async () => {
    const item = await addMenuItem({
      venue_id: venueId,
      tiers: ["everyday", "special"],
      course: "main",
      name: "Печено пиле",
      allergen_tags: [],
      is_vegetarian: false,
      is_vegan: false,
      price: 8,
    });
    expect(item.tiers.sort()).toEqual(["everyday", "special"]);

    const everyday = await listMenuItems(venueId, "everyday");
    const special = await listMenuItems(venueId, "special");
    expect(everyday.some((i) => i.id === item.id)).toBe(true);
    expect(special.some((i) => i.id === item.id)).toBe(true);

    await deleteMenuItem(item.id);
  });

  it("lets the same pool item belong to more than one standard package, and deleting a template doesn't delete the item", async () => {
    const chicken = await addMenuItem({
      venue_id: venueId,
      tiers: ["special"],
      course: "main",
      name: "Печено пиле",
      allergen_tags: [],
      is_vegetarian: false,
      is_vegan: false,
      price: 10,
    });

    const templateA = await createMenuTemplate(venueId, "Package A");
    const templateB = await createMenuTemplate(venueId, "Package B");

    await setMenuTemplateItems(templateA.id, [chicken.id]);
    await setMenuTemplateItems(templateB.id, [chicken.id]);

    const itemsA = await listMenuTemplateItems(templateA.id);
    const itemsB = await listMenuTemplateItems(templateB.id);
    expect(itemsA.map((i) => i.id)).toEqual([chicken.id]);
    expect(itemsB.map((i) => i.id)).toEqual([chicken.id]);

    await deleteMenuTemplate(templateA.id);

    const stillInPool = await listMenuItems(venueId, "special");
    expect(stillInPool.some((i) => i.id === chicken.id)).toBe(true);

    const itemsBAfter = await listMenuTemplateItems(templateB.id);
    expect(itemsBAfter.map((i) => i.id)).toEqual([chicken.id]);

    await deleteMenuTemplate(templateB.id);
    await deleteMenuItem(chicken.id);
  });

  it("deletes a menu template without deleting its pool items", async () => {
    const template = await createMenuTemplate(venueId, "Seasonal Menu");
    const soup = await addMenuItem({
      venue_id: venueId,
      tiers: ["special"],
      course: "starter",
      name: "Soup",
      allergen_tags: [],
      is_vegetarian: true,
      is_vegan: true,
      price: 5,
    });
    await setMenuTemplateItems(template.id, [soup.id]);

    await deleteMenuTemplate(template.id);

    const templates = await listMenuTemplates(venueId);
    expect(templates.some((t) => t.id === template.id)).toBe(false);

    const items = await listMenuItems(venueId, "special");
    expect(items.some((i) => i.id === soup.id)).toBe(true);

    await deleteMenuItem(soup.id);
  });
});
