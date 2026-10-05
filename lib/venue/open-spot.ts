// Where a newly added floor-plan element lands.
//
// Every "+" button used to drop its element on the same default point, so
// several additions in a row piled up exactly on top of each other and the
// one underneath could not be clicked. This keeps the default point when it is
// free and otherwise steps diagonally to the first point no other element
// starts at, staying inside the room.

type Placed = { x_cm: number; y_cm: number };

const STEP_CM = 60;
/** Two elements whose corners are closer than this count as stacked. */
const NEAR_CM = 30;

export function openSpot(
  preferred: Placed,
  size: { width_cm: number; length_cm: number },
  room: { width_cm: number; height_cm: number },
  existing: readonly Placed[],
): Placed {
  const maxX = Math.max(0, room.width_cm - size.width_cm);
  const maxY = Math.max(0, room.height_cm - size.length_cm);
  const taken = (p: Placed) => existing.some((e) => Math.abs(e.x_cm - p.x_cm) < NEAR_CM && Math.abs(e.y_cm - p.y_cm) < NEAR_CM);
  const columns = Math.max(1, Math.floor(maxX / STEP_CM) + 1);
  const rows = Math.max(1, Math.floor(maxY / STEP_CM) + 1);
  for (let i = 0; i < columns * rows; i++) {
    // Walk a grid that starts at the preferred point and wraps at the walls.
    const candidate = {
      x_cm: (preferred.x_cm + (i % columns) * STEP_CM + Math.floor(i / columns) * STEP_CM) % (maxX + 1),
      y_cm: (preferred.y_cm + Math.floor(i / columns) * STEP_CM + (i % columns) * (STEP_CM / 2)) % (maxY + 1),
    };
    if (!taken(candidate)) return candidate;
  }
  return preferred;
}
