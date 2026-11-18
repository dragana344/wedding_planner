import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const auth = { getUser: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() };
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => ({ auth }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import ResetPasswordPage from "@/app/reset-password/page";

let locationHref = "";
const fetchMock = vi.fn();
beforeEach(() => {
  locationHref = "";
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return locationHref;
      },
      set href(value: string) {
        locationHref = value;
      },
    },
  });
});

function save(password: string) {
  fireEvent.change(screen.getByLabelText("Нова лозинка"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Зачувај лозинка" }));
}

describe("/reset-password", () => {
  it("for a just-opened venue (first-login flag) saves through /api/venue/first-login, so the flag clears too", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { app_metadata: { must_change_password: true } } } });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<ResetPasswordPage />);
    save("моја-нова-лозинка");
    await waitFor(() => expect(locationHref).toBe("/venue"));
    expect(fetchMock).toHaveBeenCalledWith("/api/venue/first-login", expect.objectContaining({ body: JSON.stringify({ password: "моја-нова-лозинка" }) }));
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("otherwise updates the password directly, as before", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { app_metadata: {} } } });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
    render(<ResetPasswordPage />);
    save("моја-нова-лозинка");
    await waitFor(() => expect(locationHref).toBe("/venue"));
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "моја-нова-лозинка" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
