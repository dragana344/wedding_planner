import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("0002 schema: menu_templates, menu_items", () => {
  it("can insert a menu template with items and read them back", async () => {
    const { data: venue } = await supabase
      .from("venues")
      .insert({ name: "Menu Test Venue" })
      .select()
      .single();

    const { data: template, error: templateError } = await supabase
      .from("menu_templates")
      .insert({ venue_id: venue!.id, name: "Standard Menu" })
      .select()
      .single();
    expect(templateError).toBeNull();

    const { data: item, error: itemError } = await supabase
      .from("menu_items")
      .insert({
        venue_id: venue!.id,
        tier: "special",
        course: "main",
        name: "Grilled chicken",
        allergen_tags: ["gluten"],
        is_vegetarian: false,
      })
      .select()
      .single();
    expect(itemError).toBeNull();
    expect(item!.course).toBe("main");

    const { error: linkError } = await supabase
      .from("menu_template_items")
      .insert({ menu_template_id: template!.id, menu_item_id: item!.id });
    expect(linkError).toBeNull();

    await supabase.from("venues").delete().eq("id", venue!.id);
  });
});
