import { describe, it, expect } from "vitest";
import { eventTypeLabel, normalizeEventTypeLabel } from "@/lib/venue/event-display";

describe("event type names (0148)", () => {
  it("keeps a trimmed name only for Друго, capped at 60 characters", () => {
    expect(normalizeEventTypeLabel("other", "  Прослава за 20 години брак ")).toBe("Прослава за 20 години брак");
    expect(normalizeEventTypeLabel("other", "   ")).toBeNull();
    expect(normalizeEventTypeLabel("other", null)).toBeNull();
    expect(normalizeEventTypeLabel("wedding", "Нешто")).toBeNull();
    expect(normalizeEventTypeLabel("other", "а".repeat(80))).toHaveLength(60);
  });

  it("shows the custom name for Друго and the type's label otherwise", () => {
    expect(eventTypeLabel({ event_type: "other", event_type_label: "Прослава за 20 години брак" })).toBe("Прослава за 20 години брак");
    expect(eventTypeLabel({ event_type: "other", event_type_label: null })).toBe("Друго");
    expect(eventTypeLabel({ event_type: "other" })).toBe("Друго");
    expect(eventTypeLabel({ event_type: "wedding", event_type_label: "ignored" })).toBe("Свадба");
  });
});
