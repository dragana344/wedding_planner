import { describe, it, expect } from "vitest";
import { diffProposalElements } from "@/lib/seating/proposal-diff";
import type { ProposalSnapshotElement } from "@/lib/seating/proposals";

function el(id: string, overrides: Partial<ProposalSnapshotElement> = {}): ProposalSnapshotElement {
  return {
    id,
    element_type: "table",
    table_type_id: "tt1",
    x_cm: 0,
    y_cm: 0,
    width_cm: 150,
    length_cm: 150,
    rotation_deg: 0,
    label: null,
    group_id: null,
    table_role: "guest",
    ...overrides,
  };
}

describe("diffProposalElements", () => {
  it("highlights nothing when both sides are identical", () => {
    const a = [el("t1"), el("t2")];
    const b = [el("t1"), el("t2")];
    const { beforeHighlighted, afterHighlighted } = diffProposalElements(a, b);
    expect(beforeHighlighted.size).toBe(0);
    expect(afterHighlighted.size).toBe(0);
  });

  it("highlights an added table only on the after side", () => {
    const { beforeHighlighted, afterHighlighted } = diffProposalElements([el("t1")], [el("t1"), el("t2")]);
    expect(beforeHighlighted.size).toBe(0);
    expect(afterHighlighted).toEqual(new Set(["t2"]));
  });

  it("highlights a removed table only on the before side", () => {
    const { beforeHighlighted, afterHighlighted } = diffProposalElements([el("t1"), el("t2")], [el("t1")]);
    expect(beforeHighlighted).toEqual(new Set(["t2"]));
    expect(afterHighlighted.size).toBe(0);
  });

  it("highlights a moved table on both sides", () => {
    const { beforeHighlighted, afterHighlighted } = diffProposalElements([el("t1", { x_cm: 0 })], [el("t1", { x_cm: 200 })]);
    expect(beforeHighlighted).toEqual(new Set(["t1"]));
    expect(afterHighlighted).toEqual(new Set(["t1"]));
  });

  it("highlights a role change (e.g. guest -> crew)", () => {
    const { beforeHighlighted, afterHighlighted } = diffProposalElements(
      [el("t1", { table_role: "guest" })],
      [el("t1", { table_role: "crew" })],
    );
    expect(beforeHighlighted).toEqual(new Set(["t1"]));
    expect(afterHighlighted).toEqual(new Set(["t1"]));
  });

  it("does not highlight an unrelated table just because another one changed", () => {
    const { beforeHighlighted, afterHighlighted } = diffProposalElements(
      [el("t1"), el("t2", { x_cm: 0 })],
      [el("t1"), el("t2", { x_cm: 300 })],
    );
    expect(beforeHighlighted).toEqual(new Set(["t2"]));
    expect(afterHighlighted).toEqual(new Set(["t2"]));
  });
});
