// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { GET } from "@/app/.well-known/security.txt/route";

afterEach(() => {
  delete process.env.SECURITY_CONTACT_EMAIL;
});

describe("security.txt (SEC-026)", () => {
  it("publishes the contact, a future expiry and the canonical URL", async () => {
    process.env.SECURITY_CONTACT_EMAIL = "security@example.mk";
    const res = GET(new Request("https://app.example.mk/.well-known/security.txt"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Contact: mailto:security@example.mk");
    expect(text).toContain("Canonical: https://app.example.mk/.well-known/security.txt");
    const expires = new Date(text.match(/Expires: (.+)/)![1]);
    expect(expires.getTime()).toBeGreaterThan(Date.now() + 300 * 24 * 60 * 60 * 1000);
  });

  it("is not served until a contact is configured", () => {
    expect(GET(new Request("https://app.example.mk/.well-known/security.txt")).status).toBe(404);
  });
});
