import { describe, it, expect } from "vitest";
import { greetingMatchesGuest } from "@/lib/couple/rsvp-match";

describe("greetingMatchesGuest (A7)", () => {
  it("matches the guest's name in either order, ignoring case and spaces", () => {
    expect(greetingMatchesGuest("Петар Петровски", "петар", " Петровски ")).toBe(true);
    expect(greetingMatchesGuest("Петровски Петар", "Петар", "Петровски")).toBe(true);
    expect(greetingMatchesGuest("  Петар   Петровски ", "Петар", "Петровски")).toBe(true);
  });

  it("does not match a different person or a partial name", () => {
    expect(greetingMatchesGuest("Петар Петровски", "Петар", "Јовановски")).toBe(false);
    expect(greetingMatchesGuest("Петар Петровски и Ана", "Петар", "Петровски")).toBe(false);
  });
});
