import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// app/venue/panel.css (shared by the venue and couple panels) gives `.vp .grid`
// a 1010px min-width for its data tables, so Tailwind's bare `grid` class
// inside the couple panel forces a sideways scroll on phones. Use `sm:grid`
// or an inline grid instead.

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.tsx$/.test(e.name) ? [p] : [];
  });
}

describe("couple panel layout", () => {
  it("never uses the bare `grid` class (panel.css table rule)", () => {
    const offenders = [...files("app/couple"), ...files("components/couple")].filter((f) =>
      /className="(?:[^"]*\s)?grid(?:\s[^"]*)?"/.test(fs.readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
