import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { couplePrintData, venuePrintData } from "@/lib/seating/print-data";

// S3 task 9: data behind the printed plan and the per-table QR cards — the
// venue prints the confirmed layout, the couple their own draft.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const RUN = `print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let venueId: string;
let roomId: string;
let eventId: string;
let tableTypeId: string;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: `${RUN} Leona` }).select("id").single())).id;
  roomId = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Голема сала", width_cm: 3000, height_cm: 2000 }).select("id").single())).id;
  tableTypeId = (await must(
    admin.from("table_types").insert({ room_id: roomId, name: "R10", shape: "round", seats: 10, width_cm: 180, length_cm: 180, quantity: 9 }).select("id").single(),
  )).id;
  eventId = (await must(
    admin.from("events").insert({ venue_id: venueId, couple_names: "Ана & Марко", event_date: "2027-06-12" }).select("id").single(),
  )).id;
  await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId, layout_initialized_at: new Date().toISOString() }));
  // One by one, as the editor places them: numbering follows placement order.
  for (const el of [
    { element_type: "table", table_type_id: tableTypeId, x_cm: 100, y_cm: 100, width_cm: 180, length_cm: 180 },
    { element_type: "table", table_type_id: tableTypeId, x_cm: 400, y_cm: 100, width_cm: 180, length_cm: 180, label: "Кумови" },
    { element_type: "dance_floor", x_cm: 1000, y_cm: 600, width_cm: 900, length_cm: 900 },
  ]) {
    await must(admin.from("event_layout_elements").insert({ event_id: eventId, room_id: roomId, ...el }));
  }
  await must(admin.from("event_invitations").insert({ event_id: eventId, template_id: "classic", public_slug: `${RUN}-slug` }));
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("print data", () => {
  it("venue: the confirmed layout, names, date, and one QR card per table to the invitation", async () => {
    const data = await venuePrintData(admin, eventId, "https://kadesum.mk");
    expect(data.title).toBe("Ана & Марко");
    expect(data.subtitle).toBe(`12 јуни 2027 · ${RUN} Leona`);
    expect(data.rooms).toHaveLength(1);
    expect(data.rooms[0].items.map((i) => i.text).sort()).toEqual(["", "1", "Кумови"]);
    expect(data.cards.map((c) => c.title)).toEqual(["Маса 1", "Кумови"]);
    expect(data.cards[0].svg.startsWith("<svg")).toBe(true);
    expect(data.qrTarget).toBe(`https://kadesum.mk/invite/${RUN}-slug`);
  });

  it("couple: their own draft, not the confirmed layout", async () => {
    const draftId = randomUUID();
    await must(admin.from("events").update({
      seating_draft: {
        [roomId]: [{
          id: draftId, event_id: eventId, room_id: roomId, element_type: "table", table_type_id: tableTypeId,
          x_cm: 50, y_cm: 50, width_cm: 180, length_cm: 180, rotation_deg: 0, label: null, table_role: "guest",
        }],
      },
    }).eq("id", eventId));
    const data = await couplePrintData(eventId, "https://kadesum.mk");
    expect(data.rooms[0].items.map((i) => i.id)).toEqual([draftId]);
    expect(data.cards).toHaveLength(1);
  });
});
