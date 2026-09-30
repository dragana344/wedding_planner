import { describe, it, expect } from "vitest";
import { buildPrintRoom } from "@/lib/seating/print";
import type { EventLayoutElement, FixedElement } from "@/lib/venue/floorplan";
import type { TableType } from "@/lib/venue/rooms";

const room = { id: "r1", name: "Голема сала", width_cm: 3000, height_cm: 2000 };
const types = [
  { id: "round", shape: "round", seats: 10 },
  { id: "rect", shape: "rectangular", seats: 12 },
] as TableType[];

function el(id: string, extra: Partial<EventLayoutElement>): EventLayoutElement {
  return {
    id, event_id: "e1", room_id: "r1", element_type: "table", table_type_id: "round",
    x_cm: 0, y_cm: 0, width_cm: 180, length_cm: 180, rotation_deg: 0, label: null, table_role: "guest", ...extra,
  };
}

describe("buildPrintRoom", () => {
  const layout = [
    el("head", { table_role: "head", table_type_id: "rect", width_cm: 600, length_cm: 90, x_cm: 1000, y_cm: 50 }),
    el("t1", { x_cm: 100, y_cm: 100 }),
    el("t2", { x_cm: 400, y_cm: 100, label: "Маса 13" }),
    el("t3", { x_cm: 700, y_cm: 100, label: "Кумови" }),
    el("floor", { element_type: "dance_floor", table_type_id: null, x_cm: 1000, y_cm: 600, width_cm: 900, length_cm: 900 }),
    el("music", { element_type: "music", table_type_id: null, x_cm: 50, y_cm: 1500, width_cm: 150, length_cm: 400 }),
  ];
  const fixed: FixedElement[] = [
    { id: "door", room_id: "r1", element_type: "entrance", x_cm: 1500, y_cm: 1900, width_cm: 300, height_cm: 100, rotation_deg: 0, label: null },
  ];
  const tables = [
    { elementId: "head", label: "Главна маса", number: 0, capacity: 12 },
    { elementId: "t1", label: null, number: 1, capacity: 10 },
    { elementId: "t2", label: "Маса 13", number: 2, capacity: 10 },
    { elementId: "t3", label: "Кумови", number: 3, capacity: 10 },
  ];
  const print = buildPrintRoom(room, layout, fixed, tables, types);

  it("keeps the room's real proportions", () => {
    expect(print).toMatchObject({ name: "Голема сала", widthCm: 3000, heightCm: 2000 });
  });

  it("shows guest tables by number and named tables by name", () => {
    const byId = Object.fromEntries(print.items.map((i) => [i.id, i]));
    expect(byId.t1).toMatchObject({ kind: "table", shape: "circle", text: "1" });
    expect(byId.t2).toMatchObject({ kind: "table", text: "13" }); // "Маса 13" prints as its number
    expect(byId.t3).toMatchObject({ kind: "table", text: "Кумови" });
    expect(byId.head).toMatchObject({ kind: "named-table", shape: "rect", text: "Главна маса" });
  });

  it("draws the dance floor as the gold ring and zones as framed boxes", () => {
    const byId = Object.fromEntries(print.items.map((i) => [i.id, i]));
    expect(byId.floor).toMatchObject({ kind: "floor", shape: "circle" });
    expect(byId.music).toMatchObject({ kind: "zone", text: "Музика", vertical: true });
    expect(byId.door).toMatchObject({ kind: "zone", text: "Влез", vertical: false });
  });

  it("draws pillars as plain grey blocks", () => {
    const pillar = buildPrintRoom(room, [], [{ ...fixed[0], id: "p", element_type: "pillar", width_cm: 80, height_cm: 80 }], [], types);
    expect(pillar.items).toEqual([expect.objectContaining({ id: "p", kind: "pillar", text: "" })]);
  });

  it("leaves out walls", () => {
    const withWall = buildPrintRoom(room, [], [{ ...fixed[0], id: "w", element_type: "wall" }], [], types);
    expect(withWall.items).toEqual([]);
  });
});
