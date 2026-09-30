import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const auth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  getUser: vi.fn(),
  mfa: { getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn(), challengeAndVerify: vi.fn() },
};
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => ({ auth }) }));

import { AdminLogin } from "@/components/admin/AdminLogin";

function signIn() {
  fireEvent.change(screen.getByLabelText("Е-пошта"), { target: { value: "owner@example.com" } });
  fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "admin-password-123" } });
  fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
});

describe("AdminLogin", () => {
  it("refuses an account without the admin role and signs it out", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null });
    render(<AdminLogin />);
    signIn();
    expect(await screen.findByText("Оваа сметка нема админ пристап.")).toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("asks for the TOTP code when the admin has a factor", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { app_metadata: { role: "platform_admin" } } }, error: null });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: "f1", status: "verified" }] } });
    render(<AdminLogin />);
    signIn();
    expect(await screen.findByLabelText("Код од апликацијата")).toBeInTheDocument();
  });

  it("sends an admin without a factor to mandatory enrolment", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { app_metadata: { role: "platform_admin" } } }, error: null });
    render(<AdminLogin />);
    signIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/login/mfa"));
  });
});
