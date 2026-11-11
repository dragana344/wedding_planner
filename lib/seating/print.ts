import {
  FIXED_LABELS,
  MOVABLE_LABELS,
  type FixedElement,
  type LayoutElementType,
  type TableRole,
} from "@/lib/venue/floorplan";
import type { TableType } from "@/lib/venue/rooms";
import type { SeatTable } from "./types";

/** Only the fields buildPrintRoom actually reads — satisfied by both an
 * event's layout (EventLayoutElement) and a room's own standing layout
 * (RoomLayoutElement), so the same printable plan works for either. */
export type PrintableLayoutElement = {
  id: string;
  x_cm: number;
  y_cm: number;
  width_cm: number;
  length_cm: number;
  rotation_deg: number;
  element_type: LayoutElementType;
  table_type_id: string | null;
  table_role?: TableRole;
  label: string | null;
};

// Printable A4 plan (B7): the room's elements reduced to what the printed
// plan shows — numbered guest tables, named tables (couple, head), the dance
// floor as the gold ring, and framed zones (music, entrance, WC...). Walls
// and doors are left out, as on the client's printed sample.

export type PrintItemKind = "table" | "named-table" | "floor" | "zone" | "pillar";

export interface PrintItem {
  id: string;
  kind: PrintItemKind;
  shape: "circle" | "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  text: string;
  /** Tall narrow zones read top to bottom, like "Музика" on the sample. */
  vertical: boolean;
  /** Project C: only set when this table's seated guests aren't all on the
   * same menu — e.g. "Посно 1" — the printed plan's actual selling point
   * (knowing which table needs the different dish), per the client's own
   * example. Per-table, not per-seat: a guest party's menu breakdown is
   * recorded per party, not per individual seat. */
  menuNote?: string;
}

export interface PrintRoom {
  id: string;
  name: string;
  widthCm: number;
  heightCm: number;
  items: PrintItem[];
}

const LEFT_OUT_FIXED = new Set(["wall", "door"]);

function tableText(t: SeatTable | undefined, fallback: string): string {
  if (!t) return fallback;
  if (!t.label) return String(t.number);
  const numbered = /^Маса\s+(\S+)$/.exec(t.label);
  return numbered ? numbered[1] : t.label;
}

export function buildPrintRoom(
  room: { id: string; name: string; width_cm: number; height_cm: number },
  layout: PrintableLayoutElement[],
  fixed: FixedElement[],
  tables: SeatTable[],
  tableTypes: Pick<TableType, "id" | "shape">[],
  menuNotes: Map<string, string> = new Map(),
): PrintRoom {
  const byElement = new Map(tables.map((t) => [t.elementId, t]));
  const items: PrintItem[] = [];

  for (const el of layout) {
    const base = { id: el.id, x: el.x_cm, y: el.y_cm, w: el.width_cm, h: el.length_cm, rotation: el.rotation_deg };
    if (el.element_type === "table") {
      const type = tableTypes.find((tt) => tt.id === el.table_type_id);
      const shape = type?.shape === "rectangular" ? "rect" : "circle";
      const named = (el.table_role ?? "guest") !== "guest";
      const seat = byElement.get(el.id);
      items.push({
        ...base,
        kind: named ? "named-table" : "table",
        shape,
        text: named ? (seat?.label ?? el.label ?? MOVABLE_LABELS.table) : tableText(seat, el.label ?? "•"),
        vertical: false,
        menuNote: menuNotes.get(el.id),
      });
    } else if (el.element_type === "dance_floor") {
      items.push({ ...base, kind: "floor", shape: "circle", text: "", vertical: false });
    } else {
      items.push({ ...base, kind: "zone", shape: "rect", text: el.label ?? MOVABLE_LABELS[el.element_type], vertical: el.length_cm > el.width_cm * 1.5 });
    }
  }

  for (const el of fixed) {
    if (LEFT_OUT_FIXED.has(el.element_type)) continue;
    const pillar = el.element_type === "pillar";
    items.push({
      id: el.id,
      kind: pillar ? "pillar" : "zone",
      shape: "rect",
      x: el.x_cm,
      y: el.y_cm,
      w: el.width_cm,
      h: el.height_cm,
      rotation: el.rotation_deg,
      text: pillar ? "" : (el.label ?? FIXED_LABELS[el.element_type]),
      vertical: !pillar && el.height_cm > el.width_cm * 1.5,
    });
  }

  return { id: room.id, name: room.name, widthCm: room.width_cm, heightCm: room.height_cm, items };
}
