import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// SEC-016: the login's second step for staff with a TOTP factor.

const auth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  mfa: {
    getAuthenticatorAssuranceLevel: vi.fn(),
    listFactors: vi.fn(),
    challengeAndVerify: vi.fn(),
  },
};
const mockPush = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({ auth }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import LoginPage from "@/app/login/page";

const verified = { id: "f-1", factor_type: "totp", status: "verified" };

function signIn() {
  fireEvent.change(screen.getByLabelText("Е-пошта"), { target: { value: "staff@example.com" } });
  fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "secret-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
}

beforeEach(() => {
  mockPush.mockReset();
  auth.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.mfa.getAuthenticatorAssuranceLevel.mockReset();
  auth.mfa.listFactors.mockReset().mockResolvedValue({ data: { all: [verified], totp: [verified], phone: [] }, error: null });
  auth.mfa.challengeAndVerify.mockReset();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("LoginPage", () => {
  it("goes straight to /venue for a user without a factor", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1", currentAuthenticationMethods: [] },
      error: null,
    });
    render(<LoginPage />);
    signIn();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/venue"));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "staff@example.com", password: "secret-password" });
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("asks for the TOTP code after the password when the account has a factor", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });

    render(<LoginPage />);
    signIn();

    const code = await screen.findByLabelText("Код од апликацијата");
    expect(screen.getByRole("heading", { name: "Двофакторска потврда" })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Потврди" }));

    await waitFor(() => expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-1", code: "123456" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/venue"));
  });

  it("stays on the code step with an error when the code is wrong", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { message: "Invalid TOTP code entered" } });

    render(<LoginPage />);
    signIn();
    fireEvent.change(await screen.findByLabelText("Код од апликацијата"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Потврди" }));

    expect(await screen.findByText("Кодот не е точен. Обидете се повторно.")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("goes back to the password form and drops the half-finished session", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    render(<LoginPage />);
    signIn();
    await screen.findByLabelText("Код од апликацијата");
    fireEvent.click(screen.getByRole("button", { name: "Назад кон најава" }));
    expect(await screen.findByRole("button", { name: "Најави се" })).toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("opens directly on the code step when redirected with ?mfa=1 and the session still needs it", async () => {
    window.history.replaceState(null, "", "/login?mfa=1");
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    render(<LoginPage />);
    expect(await screen.findByLabelText("Код од апликацијата")).toBeInTheDocument();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("keeps the password form on ?mfa=1 when there is no session to finish", async () => {
    window.history.replaceState(null, "", "/login?mfa=1");
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] },
      error: null,
    });
    render(<LoginPage />);
    await waitFor(() => expect(auth.mfa.getAuthenticatorAssuranceLevel).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Најави се" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Код од апликацијата")).not.toBeInTheDocument();
  });

  it("shows the sign-in error and does not check MFA again when the password is wrong", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "Invalid login credentials" } });
    render(<LoginPage />);
    // The page checks once on load for a session that still needs its code.
    await waitFor(() => expect(auth.mfa.getAuthenticatorAssuranceLevel.mock.calls.length).toBeLessThanOrEqual(1));
    const checksOnLoad = auth.mfa.getAuthenticatorAssuranceLevel.mock.calls.length;
    signIn();
    expect(await screen.findByText("Неточен email или лозинка.")).toBeInTheDocument();
    expect(auth.mfa.getAuthenticatorAssuranceLevel).toHaveBeenCalledTimes(checksOnLoad);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
