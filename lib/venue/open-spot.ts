// Where a newly added floor-plan element lands.
//
// Every "+" button used to drop its element on the same default point, so
// several additions in a row piled up on top of each other and the one
// underneath could not be clicked. Now the default point is kept when the
// element fits there without touching anything; otherwise the room is scanned
// in rows, left to right and top to bottom, for the first place it does fit.
// Twelve tables added one after another therefore come out as tidy rows the
// venue only has to nudge, not a heap to untangle.

type Point = { x_cm: number; y_cm: number };
/** An element already on the plan. Fixed elements carry height_cm, movable ones length_cm. */
type Placed = Point & { width_cm?: number; length_cm?: number; height_cm?: number };

/** Clear space kept around a newly placed element, and from the walls. */
const GAP_CM = 40;
/** Size assumed for an existing element that does not say how big it is. */
const UNKNOWN_SIZE_CM = 100;

export function openSpot(
  preferred: Point,
  size: { width_cm: number; length_cm: number },
  room: { width_cm: number; height_cm: number },
  existing: readonly Placed[],
): Point {
  const maxX = Math.max(0, room.width_cm - size.width_cm);
  const maxY = Math.max(0, room.height_cm - size.length_cm);
  const overlaps = (p: Point) =>
    existing.some((e) => {
      const w = e.width_cm ?? UNKNOWN_SIZE_CM;
      const h = e.length_cm ?? e.height_cm ?? UNKNOWN_SIZE_CM;
      return p.x_cm < e.x_cm + w + GAP_CM && e.x_cm < p.x_cm + size.width_cm + GAP_CM && p.y_cm < e.y_cm + h + GAP_CM && e.y_cm < p.y_cm + size.length_cm + GAP_CM;
    });
  const start = { x_cm: Math.min(Math.max(0, preferred.x_cm), maxX), y_cm: Math.min(Math.max(0, preferred.y_cm), maxY) };
  if (!overlaps(start)) return start;

  const stepX = size.width_cm + GAP_CM;
  const stepY = size.length_cm + GAP_CM;
  for (let y = Math.min(GAP_CM, maxY); y <= maxY; y += stepY) {
    for (let x = Math.min(GAP_CM, maxX); x <= maxX; x += stepX) {
      const candidate = { x_cm: x, y_cm: y };
      if (!overlaps(candidate)) return candidate;
    }
  }
  // A room with no free place left: back to the default point, as before.
  return start;
}
