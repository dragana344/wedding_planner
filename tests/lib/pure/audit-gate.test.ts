import { describe, it, expect } from "vitest";
import { evaluateAudit } from "../../../scripts/audit-gate.mjs";

const advisory = (id: string, severity: string) => ({
  name: "picomatch",
  title: `advisory ${id}`,
  severity,
  url: `https://github.com/advisories/${id}`,
});
const audit = (...vias: unknown[]) => ({ vulnerabilities: { picomatch: { via: vias } } });
const allow = { "GHSA-aaaa-bbbb-cccc": { reason: "build-time only", until: "2026-12-18" } };

describe("audit gate (SEC-011)", () => {
  it("passes when a high advisory has a current exception", () => {
    const r = evaluateAudit(audit(advisory("GHSA-aaaa-bbbb-cccc", "high")), allow, "2026-11-18");
    expect(r.blocked).toEqual([]);
    expect(r.allowed).toHaveLength(1);
  });

  it("blocks a high or critical advisory with no exception", () => {
    expect(evaluateAudit(audit(advisory("GHSA-zzzz-zzzz-zzzz", "high")), allow, "2026-11-18").blocked).toHaveLength(1);
    expect(evaluateAudit(audit(advisory("GHSA-yyyy-yyyy-yyyy", "critical")), allow, "2026-11-18").blocked).toHaveLength(1);
  });

  it("blocks again once the exception has expired", () => {
    const r = evaluateAudit(audit(advisory("GHSA-aaaa-bbbb-cccc", "high")), allow, "2026-12-19");
    expect(r.blocked).toEqual([expect.objectContaining({ id: "GHSA-aaaa-bbbb-cccc", why: "exception expired on 2026-12-18" })]);
  });

  it("matches the advisory id whatever its letter case", () => {
    const r = evaluateAudit(audit(advisory("GHSA-AAAA-BBBB-CCCC", "high")), allow, "2026-11-18");
    expect(r.blocked).toEqual([]);
  });

  it("still allows the last day itself", () => {
    expect(evaluateAudit(audit(advisory("GHSA-aaaa-bbbb-cccc", "high")), allow, "2026-12-18").blocked).toEqual([]);
  });

  it("ignores moderate/low advisories and package-name links between packages", () => {
    const r = evaluateAudit(audit(advisory("GHSA-mmmm-mmmm-mmmm", "moderate"), "some-other-package"), {}, "2026-11-18");
    expect(r.blocked).toEqual([]);
    expect(r.allowed).toEqual([]);
  });
});
