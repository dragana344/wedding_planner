// @vitest-environment node
//
// The first-login routes of an admin-opened venue: POST /api/venue/first-login
// (own sign-in password) and POST /api/venue/terms (owner accepts the Terms).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ auth }) }));

const venue = vi.hoisted(() => ({ getCurrentVenueId: vi.fn(async (): Promise<string | null> => "venue-1") }));
vi.mock("@/lib/venue/current-venue", () => venue);

const onboarding = vi.hoisted(() => ({
  mustChangePassword: (u: { app_metadata?: Record<string, unknown> } | null) => u?.app_metadata?.must_change_password === true,
  clearMustChangePassword: vi.fn(async () => undefined),
  venueOwnerName: vi.fn(async (): Promise<string | null> => "Марија"),
  acceptVenueTerms: vi.fn(async () => ({ firstAcceptance: true })),
  verifyAccountPassword: vi.fn(async () => true),
}));
vi.mock("@/lib/venue/onboarding", () => onboarding);

const elevation = vi.hoisted(() => ({ verifyVenueManager: vi.fn() }));
vi.mock("@/lib/venue/manager-elevation", () => elevation);

const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit", () => audit);

const rateLimit = vi.hoisted(() => ({
  RATE_LIMITS: { managerElevation: { bucket: "manager-elevation", limit: 10, windowSeconds: 60, failClosed: true } },
  checkRateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => "1.2.3.4"),
  rateLimitedResponse: vi.fn(() => NextResponse.json({ error: "Премногу обиди." }, { status: 429 })),
}));
vi.mock("@/lib/security/rate-limit", () => rateLimit);

import { POST as firstLogin } from "@/app/api/venue/first-login/route";
import { POST as terms } from "@/app/api/venue/terms/route";
import { LEGAL_VERSION } from "@/lib/legal/facts";

async function call(handler: typeof firstLogin, path: string, body: unknown) {
  const request = new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await handler(request, { params: Promise.resolve({}) } as never);
  return { status: res.status, body: await res.json() };
}

const flagged = { id: "user-1", app_metadata: { must_change_password: true } };

beforeEach(() => {
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: flagged } });
  auth.updateUser.mockResolvedValue({ error: null });
  venue.getCurrentVenueId.mockResolvedValue("venue-1");
  onboarding.venueOwnerName.mockResolvedValue("Марија");
  onboarding.acceptVenueTerms.mockResolvedValue({ firstAcceptance: true });
  elevation.verifyVenueManager.mockResolvedValue({ managerId: "owner-1", managerName: "Марија", isOwner: true });
});

describe("POST /api/venue/first-login", () => {
  it("sets the owner's own password, clears the flag, signs other devices out and audits", async () => {
    expect(await call(firstLogin, "/api/venue/first-login", { password: "моја-лозинка-1" })).toEqual({ status: 200, body: { ok: true } });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "моја-лозинка-1" });
    expect(onboarding.clearMustChangePassword).toHaveBeenCalledWith("user-1");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(audit.recordAudit).toHaveBeenCalledWith({ action: "venue_first_password_set", actorType: "staff", actorId: "user-1", venueId: "venue-1" });
  });

  it("needs at least 10 characters", async () => {
    const res = await call(firstLogin, "/api/venue/first-login", { password: "кратка" });
    expect(res).toEqual({ status: 400, body: { error: "Лозинката мора да има најмалку 10 знаци." } });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("works only while the first-login flag is set (otherwise Поставки + owner is the way)", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-1", app_metadata: {} } } });
    expect((await call(firstLogin, "/api/venue/first-login", { password: "моја-лозинка-1" })).status).toBe(409);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller or one without a venue", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await call(firstLogin, "/api/venue/first-login", { password: "моја-лозинка-1" })).status).toBe(401);
    auth.getUser.mockResolvedValue({ data: { user: flagged } });
    venue.getCurrentVenueId.mockResolvedValue(null);
    expect((await call(firstLogin, "/api/venue/first-login", { password: "моја-лозинка-1" })).status).toBe(401);
  });

  it("keeps the flag when Auth rejects the password, with a Macedonian message", async () => {
    auth.updateUser.mockResolvedValue({ error: { code: "same_password", message: "x" } });
    expect(await call(firstLogin, "/api/venue/first-login", { password: "моја-лозинка-1" })).toEqual({
      status: 400,
      body: { error: "Новата лозинка мора да е различна од старата." },
    });
    expect(onboarding.clearMustChangePassword).not.toHaveBeenCalled();
  });
});

describe("POST /api/venue/terms", () => {
  it("records the acceptance with the owner's password, audits it and starts the tour for a new venue", async () => {
    expect(await call(terms, "/api/venue/terms", { password: "сопственик-1", accepted: true })).toEqual({ status: 200, body: { ok: true, startTour: true } });
    expect(elevation.verifyVenueManager).toHaveBeenCalledWith("venue-1", "Марија", "сопственик-1");
    expect(onboarding.acceptVenueTerms).toHaveBeenCalledWith("venue-1");
    expect(audit.recordAudit).toHaveBeenCalledWith({
      action: "venue_terms_accepted",
      actorType: "staff",
      venueId: "venue-1",
      targetId: "owner-1",
      managerName: "Марија",
      details: { terms_version: LEGAL_VERSION },
    });
  });

  it("does not start the tour when a venue re-accepts a new version", async () => {
    onboarding.acceptVenueTerms.mockResolvedValue({ firstAcceptance: false });
    expect((await call(terms, "/api/venue/terms", { password: "сопственик-1", accepted: true })).body).toEqual({ ok: true, startTour: false });
  });

  it("refuses a wrong or locked owner password and records nothing", async () => {
    elevation.verifyVenueManager.mockResolvedValue({ errorCode: "invalid" });
    const res = await call(terms, "/api/venue/terms", { password: "погрешна", accepted: true });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Неточна лозинка на сопственикот/);
    expect(onboarding.acceptVenueTerms).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("needs the checkbox", async () => {
    expect((await call(terms, "/api/venue/terms", { password: "сопственик-1", accepted: false })).status).toBe(400);
    expect((await call(terms, "/api/venue/terms", { password: "сопственик-1" })).status).toBe(400);
    expect(onboarding.acceptVenueTerms).not.toHaveBeenCalled();
  });

  it("a venue with no owner login accepts with its own sign-in password (0178), audited without a manager", async () => {
    onboarding.venueOwnerName.mockResolvedValue(null);
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "sala@test.mk", app_metadata: {} } } });
    expect(await call(terms, "/api/venue/terms", { password: "lozinka-lokal", accepted: true })).toEqual({ status: 200, body: { ok: true, startTour: true } });
    expect(onboarding.verifyAccountPassword).toHaveBeenCalledWith("sala@test.mk", "lozinka-lokal");
    expect(elevation.verifyVenueManager).not.toHaveBeenCalled();
    expect(audit.recordAudit).toHaveBeenCalledWith({
      action: "venue_terms_accepted",
      actorType: "staff",
      actorId: "user-1",
      venueId: "venue-1",
      details: { terms_version: LEGAL_VERSION, accepted_with: "account_password" },
    });

    onboarding.verifyAccountPassword.mockResolvedValueOnce(false);
    onboarding.acceptVenueTerms.mockClear();
    const wrong = await call(terms, "/api/venue/terms", { password: "pogresna", accepted: true });
    expect(wrong).toEqual({ status: 401, body: { error: "Неточна лозинка за најава на локалот." } });
    expect(onboarding.acceptVenueTerms).not.toHaveBeenCalled();
  });

  it("is rate-limited like an elevation", async () => {
    rateLimit.checkRateLimit.mockResolvedValueOnce({ ok: false } as never);
    expect((await call(terms, "/api/venue/terms", { password: "сопственик-1", accepted: true })).status).toBe(429);
    expect(rateLimit.checkRateLimit).toHaveBeenCalledWith(rateLimit.RATE_LIMITS.managerElevation, "1.2.3.4");
  });
});
