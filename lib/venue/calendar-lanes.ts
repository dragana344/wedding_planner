/** One event's place in a day column when events overlap in time. */
export type Lane = { lane: number; lanes: number };

/**
 * Splits a day's events into side-by-side lanes so overlapping events sit
 * in thinner columns next to each other instead of on top of each other.
 * Events that overlap (directly or through a chain) form one group; every
 * event in a group gets the same number of lanes, and each takes the first
 * lane that is free at its start. Events that touch end-to-start don't
 * overlap. Pure, so it is testable without layout.
 */
export function assignLanes<T>(events: T[], range: (e: T) => { start: number; end: number }): Map<T, Lane> {
  const sorted = events
    .map((e) => ({ e, ...range(e) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const result = new Map<T, Lane>();
  let group: { e: T; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  function closeGroup() {
    for (const g of group) result.set(g.e, { lane: g.lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  }

  for (const item of sorted) {
    if (item.start >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    group.push({ e: item.e, lane });
    groupEnd = Math.max(groupEnd, item.end);
  }
  closeGroup();
  return result;
}
