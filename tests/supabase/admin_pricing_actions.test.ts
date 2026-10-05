import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { pricingActionCore } from "@/lib/admin/pricing-actions-core";
import { getPricingCards } from "@/lib/marketing/pricing";

// Landing-page price cards (0085), through pricingActionCore directly — same
// pattern as tests/supabase/admin_plan_actions.test.ts. Shared local DB: only
// ever touches the cards this file created.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad05", requestId: null };
const created: string[] = [];
const card = (name: string) => ({ name, price: "999 ден", period: null, features: ["Едно", "Две"], isFeatured: false, isPublished: true, sortOrder: 900 });

afterAll(async () => {
  if (created.length) await admin.from("pricing_cards").delete().in("id", created);
});

describe("pricing card actions (0085)", () => {
  it("seeds the three cards the landing page showed before", async () => {
    const { data } = await admin.from("pricing_cards").select("name").in("name", ["Основен", "Про", "Премиум"]);
    expect(data).toHaveLength(3);
  });

  it("creates, edits and deletes a card", async () => {
    const name = `Тест ${Date.now()}`;
    const { data } = await pricingActionCore.create(card(name), ctx);
    created.push(data.id);

    await pricingActionCore.update({ ...card(name), cardId: data.id, price: "1.200 ден", features: ["Само едно"] }, ctx);
    const { data: row } = await admin.from("pricing_cards").select("price, features").eq("id", data.id).single();
    expect(row).toEqual({ price: "1.200 ден", features: ["Само едно"] });

    await pricingActionCore.remove({ cardId: data.id }, ctx);
    const { data: gone } = await admin.from("pricing_cards").select("id").eq("id", data.id);
    expect(gone).toEqual([]);
    await expect(pricingActionCore.remove({ cardId: data.id }, ctx)).rejects.toThrow("Картичката не постои.");
  });

  it("shows only published cards on the landing page", async () => {
    const name = `Скриена ${Date.now()}`;
    const { data } = await pricingActionCore.create({ ...card(name), isPublished: false }, ctx);
    created.push(data.id);
    expect((await getPricingCards()).map((c) => c.id)).not.toContain(data.id);

    await pricingActionCore.update({ ...card(name), cardId: data.id, isPublished: true }, ctx);
    expect((await getPricingCards()).map((c) => c.id)).toContain(data.id);
  });

  it("is unreadable with the public anon key", async () => {
    const { data } = await anon.from("pricing_cards").select("id");
    expect(data ?? []).toEqual([]);
  });
});
