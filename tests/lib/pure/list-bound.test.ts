// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("list bounds (PERF-002)", () => {
  it("passes lists through and warns only when the bound is reached", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(checkListBound([1, 2, 3], "event_guests")).toEqual([1, 2, 3]);
    expect(checkListBound(null, "event_guests")).toEqual([]);
    expect(warn).not.toHaveBeenCalled();

    checkListBound(Array.from({ length: MAX_LIST_ROWS }, (_, i) => i), "event_guests");
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toMatchObject({ msg: "list_bound_reached", list: "event_guests", max: 1000 });
  });
});
