import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Core logic for the landing page's price cards (Ценовник). Same split as
// lib/admin/plan-actions-core.ts: app/admin/(panel)/pricing/actions.ts wraps
// each function in adminAction, and a DB test can call these directly.

const db = () => createServiceRoleClient();
// revalidatePath throws outside a request (a DB test calling the core).
const revalidatePathSafe = (p: string) => {
  try {
    revalidatePath(p);
  } catch {
    /* outside a request (tests) */
  }
};
const revalidateAll = () => {
  revalidatePathSafe("/admin/pricing");
  revalidatePathSafe("/");
};

const NOT_FOUND = "Картичката не постои.";
export const MAX_PRICING_FEATURES = 12;

const card = {
  name: z.string().trim().min(1, "Внесете име.").max(60, "Името е предолго."),
  price: z.string().trim().min(1, "Внесете цена.").max(40, "Цената е предолга."),
  // "" from an emptied input means "no period" (e.g. "По договор").
  period: z
    .string()
    .trim()
    .max(40, "Периодот е предолг.")
    .nullable()
    .transform((v) => v || null),
  // Blank lines are dropped rather than rejected: an empty row left in the
  // checklist editor is not a mistake worth an error.
  features: z
    .array(z.string().trim().max(120, "Ставката е предолга."))
    .transform((items) => items.filter(Boolean))
    .pipe(z.array(z.string()).max(MAX_PRICING_FEATURES, `Најмногу ${MAX_PRICING_FEATURES} ставки.`)),
  isFeatured: z.boolean(),
  isPublished: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
};

export const pricingSchemas = {
  create: z.object(card),
  update: z.object({ cardId: z.string().uuid(), ...card }),
  id: z.object({ cardId: z.string().uuid() }),
};

type CardInput = z.infer<typeof pricingSchemas.create>;

const toRow = (i: CardInput) => ({
  name: i.name,
  price: i.price,
  period: i.period,
  features: i.features,
  is_featured: i.isFeatured,
  is_published: i.isPublished,
  sort_order: i.sortOrder,
});

export const pricingActionCore = {
  // ctx is part of the shape adminAction calls every core function with.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async create(i: CardInput, _ctx: AdminContext) {
    const { data, error } = await db().from("pricing_cards").insert(toRow(i)).select("id").single();
    if (error) throw error;
    const cardId = data.id as string;
    revalidateAll();
    return { data: { id: cardId }, audit: { action: "admin_pricing_card_created", targetId: cardId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async update(i: z.infer<typeof pricingSchemas.update>, _ctx: AdminContext) {
    const { data, error } = await db()
      .from("pricing_cards")
      .update({ ...toRow(i), updated_at: new Date().toISOString() })
      .eq("id", i.cardId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(NOT_FOUND);
    revalidateAll();
    return { data: null, audit: { action: "admin_pricing_card_updated", targetId: i.cardId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(i: z.infer<typeof pricingSchemas.id>, _ctx: AdminContext) {
    const { data, error } = await db().from("pricing_cards").delete().eq("id", i.cardId).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(NOT_FOUND);
    revalidateAll();
    return { data: null, audit: { action: "admin_pricing_card_deleted", targetId: i.cardId } };
  },
};
