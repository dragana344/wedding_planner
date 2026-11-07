// Project C: a wide room starts zoomed to fit the visible width instead of
// overflowing into a horizontal scrollbar at 100%. Pure arithmetic, kept out
// of the component so it's testable without jsdom's zeroed-out layout
// (clientWidth is always 0 in jsdom — this function never touches the DOM).

/**
 * The zoom level that fits a room's full width into `availablePx`, never
 * above 1 (never zooms IN past 100%) and never below `minZoom`. Returns 1
 * when the room already fits, or when there's nothing to measure yet.
 */
export function fitZoom(roomWidthCm: number, pxPerCm: number, availablePx: number, minZoom = 0.5): number {
  const roomWidthPx = roomWidthCm * pxPerCm;
  if (availablePx <= 0 || roomWidthPx <= availablePx) return 1;
  return Math.max(minZoom, +(availablePx / roomWidthPx).toFixed(2));
}
