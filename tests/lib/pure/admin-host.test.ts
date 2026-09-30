// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isAdminHost } from "@/lib/admin/host";

describe("isAdminHost", () => {
  it("recognises the admin subdomain in production and locally", () => {
    expect(isAdminHost("admin.kadesum.mk")).toBe(true);
    expect(isAdminHost("admin.localhost:3000")).toBe(true);
    expect(isAdminHost("ADMIN.kadesum.mk")).toBe(true);
  });
  it("rejects everything else", () => {
    for (const h of ["kadesum.mk", "www.kadesum.mk", "localhost:3000", "notadmin.kadesum.mk", "admin-kadesum.mk", "", null, undefined]) {
      expect(isAdminHost(h), String(h)).toBe(false);
    }
  });
});
