import type { ProposalSnapshotElement } from "./proposals";

/**
 * Fix #3: which element ids differ between a proposal's "before" and
 * "after" snapshots, for highlighting on the two small floor-plan views
 * next to a pending proposal — not a textual change log, just "this one
 * doesn't look the same going forward". Pure and client-safe: both
 * snapshots are already fetched by the time this runs.
 */
export function diffProposalElements(
  before: ProposalSnapshotElement[],
  after: ProposalSnapshotElement[],
): { beforeHighlighted: Set<string>; afterHighlighted: Set<string> } {
  const beforeById = new Map(before.map((el) => [el.id, el]));
  const afterById = new Map(after.map((el) => [el.id, el]));

  function same(a: ProposalSnapshotElement, b: ProposalSnapshotElement): boolean {
    return (
      a.element_type === b.element_type &&
      a.table_type_id === b.table_type_id &&
      a.x_cm === b.x_cm &&
      a.y_cm === b.y_cm &&
      a.width_cm === b.width_cm &&
      a.length_cm === b.length_cm &&
      a.rotation_deg === b.rotation_deg &&
      a.label === b.label &&
      a.table_role === b.table_role &&
      a.group_id === b.group_id
    );
  }

  const beforeHighlighted = new Set<string>();
  for (const [id, b] of beforeById) {
    const a = afterById.get(id);
    if (!a || !same(a, b)) beforeHighlighted.add(id);
  }
  const afterHighlighted = new Set<string>();
  for (const [id, a] of afterById) {
    const b = beforeById.get(id);
    if (!b || !same(a, b)) afterHighlighted.add(id);
  }
  return { beforeHighlighted, afterHighlighted };
}
