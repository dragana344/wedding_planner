import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NotificationsList } from "@/components/venue/dashboard/NotificationsList";

describe("NotificationsList", () => {
  it("gives each row a leading spacer so .plan-row's 4-column grid doesn't crush time into name", () => {
    const { container } = render(
      <NotificationsList
        items={[{ id: "n1", at: "2028-01-01T10:00:00Z", kind: "event_created", title: "Нов настан", detail: null, eventId: null }]}
        today="2028-01-01"
      />
    );
    const row = container.querySelector(".plan-row")!;
    // dot, time, name — the same 3 (of the grid's 4) columns the dashboard's
    // own "Дневен план" plan-row uses, so this list lays out identically.
    expect(row.children).toHaveLength(3);
    expect(row.children[0]).toHaveClass("plan-dot");
    expect(row.children[1]).toHaveClass("plan-time");
    expect(row.children[2]).toHaveClass("plan-name");
  });
});
