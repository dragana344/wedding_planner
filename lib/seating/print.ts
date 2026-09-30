import {
  FIXED_LABELS,
  MOVABLE_LABELS,
  type EventLayoutElement,
  type FixedElement,
} from "@/lib/venue/floorplan";
import type { TableType } from "@/lib/venue/rooms";
import type { SeatTable } from "./types";

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
  layout: EventLayoutElement[],
  fixed: FixedElement[],
  tables: SeatTable[],
  tableTypes: Pick<TableType, "id" | "shape">[],
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
