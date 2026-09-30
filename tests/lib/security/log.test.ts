// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { log, logSecurityEvent, errorFields } from "@/lib/log";

afterEach(() => {
  vi.restoreAllMocks();
});

function captured(spy: { mock: { calls: unknown[][] } }) {
  return JSON.parse(spy.mock.calls[0][0] as string);
}

describe("structured logging (OBS-002)", () => {
  it("writes one JSON line with level, message and fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("info", "api_request", { request_id: "abc", route: "/api/couple/guests", status: 200, duration_ms: 12 });
    const line = captured(spy);
    expect(line).toMatchObject({ level: "info", msg: "api_request", request_id: "abc", status: 200, duration_ms: 12 });
    expect(typeof line.time).toBe("string");
  });

  it("redacts passwords, tokens, cookies and guests' personal data, including nested", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("info", "x", {
      password: "hunter2-secret",
      token: "abcd1234",
      body: { full_name: "Ана Петровска", phone: "+38970111222", email: "a@b.mk", notes: "алергија", party_size: 2 },
      headers: { cookie: "couple_session=zzz", authorization: "Bearer q" },
    });
    const raw = spy.mock.calls[0][0] as string;
    for (const secret of ["hunter2-secret", "abcd1234", "Ана Петровска", "+38970111222", "a@b.mk", "алергија", "couple_session=zzz", "Bearer q"]) {
      expect(raw).not.toContain(secret);
    }
    expect(JSON.parse(raw).body.party_size).toBe(2);
  });

  it("routes errors to console.error and describes them without request data", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log("error", "api_error", errorFields(Object.assign(new Error("duplicate key value"), { code: "23505" })));
    expect(captured(spy)).toMatchObject({ level: "error", error_message: "duplicate key value", error_code: "23505" });
  });

  it("marks security events", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logSecurityEvent("couple_login_failed", { reason: "invalid" });
    expect(captured(spy)).toMatchObject({ msg: "couple_login_failed", security_event: true, reason: "invalid" });
  });
});
