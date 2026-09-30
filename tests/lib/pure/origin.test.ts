import { describe, it, expect } from "vitest";
import { resolveOrigin } from "@/lib/origin";

function headers(map: Record<string, string>) {
  return (name: string) => map[name] ?? null;
}

describe("resolveOrigin (QR links)", () => {
  it("uses the configured site URL when there is one", () => {
    expect(resolveOrigin(headers({ host: "evil.test" }), "https://kadesum.mk/")).toBe("https://kadesum.mk");
  });

  it("ignores x-forwarded-host, which a client can set", () => {
    expect(resolveOrigin(headers({ host: "kadesum.mk", "x-forwarded-host": "evil.test", "x-forwarded-proto": "https" }))).toBe("https://kadesum.mk");
  });

  it("accepts only http or https as the forwarded protocol", () => {
    expect(resolveOrigin(headers({ host: "kadesum.mk", "x-forwarded-proto": "javascript" }))).toBe("https://kadesum.mk");
  });

  it("uses http for local hosts", () => {
    expect(resolveOrigin(headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(resolveOrigin(headers({ host: "127.0.0.1:3200" }))).toBe("http://127.0.0.1:3200");
  });

  it("refuses a host header that is not a host", () => {
    expect(resolveOrigin(headers({ host: "a.test/path?x" }))).toBe("http://localhost:3000");
  });
});
