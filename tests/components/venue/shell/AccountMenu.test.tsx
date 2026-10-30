import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountMenu } from "@/components/venue/shell/AccountMenu";
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => ({ auth: { signOut } }) }));

const mockFetch = vi.fn();
beforeEach(() => {
  mockPush.mockReset();
  signOut.mockClear();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

function renderMenu() {
  return render(
    <ManagerElevationProvider>
      <AccountMenu venueName="Сала Езеро" />
    </ManagerElevationProvider>
  );
}

describe("AccountMenu — manager elevation", () => {
  it("shows 'Логирај се како менаџер' when not elevated", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    expect(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ })).toBeInTheDocument();
    expect(screen.queryByText("Одјави се од менаџер")).not.toBeInTheDocument();
  });

  it("shows only the venue name, with no role text, until a manager elevates", () => {
    renderMenu();
    expect(screen.getByText("Сала Езеро")).toBeInTheDocument();
    expect(screen.queryByText(/Менаџер/)).not.toBeInTheDocument();
  });

  it("never shows 'Поставки' in the dropdown when not elevated — it only lives in the sidebar", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    expect(screen.queryByRole("menuitem", { name: /Поставки/ })).not.toBeInTheDocument();
  });

  it("still doesn't show 'Поставки' in the dropdown once elevated as the owner", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: "tok1", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Власник", isOwner: true }) });
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));
    fireEvent.change(screen.getByLabelText("Име"), { target: { value: "Власник" } });
    fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "pw-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Одјави се од менаџер" })).toBeInTheDocument());
    expect(screen.queryByRole("menuitem", { name: /Поставки/ })).not.toBeInTheDocument();
  });

  it("opens the name/password form, elevates on submit, and then shows 'Одјави се од менаџер'", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: "tok1", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко" }) });
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));

    fireEvent.change(screen.getByLabelText("Име"), { target: { value: "Марко" } });
    fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "pw-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Најави се" }));

    // The dropdown stays open after a successful submit (just swaps the
    // form back out for the menu list) — no need to reopen it.
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Одјави се од менаџер" })).toBeInTheDocument());
    expect(screen.getByText("Менаџер: Марко")).toBeInTheDocument();
  });

  it("shows the server's error message on a failed elevation attempt", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Неточно име или лозинка." }) });
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));
    fireEvent.change(screen.getByLabelText("Име"), { target: { value: "Марко" } });
    fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
    expect(await screen.findByText("Неточно име или лозинка.")).toBeInTheDocument();
  });

  it("lets an elevated manager change their own password", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "tok1", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко", isOwner: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));
    fireEvent.change(screen.getByLabelText("Име"), { target: { value: "Марко" } });
    fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "pw-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Одјави се од менаџер" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("menuitem", { name: /Смени ја мојата лозинка/ }));
    fireEvent.change(screen.getByLabelText("Тековна лозинка"), { target: { value: "pw-1" } });
    fireEvent.change(screen.getByLabelText("Нова лозинка"), { target: { value: "new-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/venue/managers/change-password",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ currentPassword: "pw-1", newPassword: "new-password-123" }) }),
      ),
    );
    // A password change revokes every elevation for this manager server-side
    // (final review finding) — the tab drops its own token to match, even
    // though deAuthorize()'s own best-effort fetch call to /deauthorize has
    // no mocked response configured here.
    const successMessage = await screen.findByText(/Лозинката е сменета/);
    expect(successMessage).toBeInTheDocument();
    // The success message must not render in the error colour (final review finding).
    expect(successMessage).toHaveStyle({ color: "var(--ok)" });
    // The top button's badge reverts to the plain staff role — deAuthorize()
    // really did clear the elevation, even though the change-password form
    // itself stays open so the confirmation message stays visible.
    expect(screen.queryByText("Менаџер: Марко")).not.toBeInTheDocument();
  });

  it("requires the current password and surfaces the server's rejection of a wrong one (final review finding)", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "tok1", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко", isOwner: false }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Тековната лозинка не е точна." }) });
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));
    fireEvent.change(screen.getByLabelText("Име"), { target: { value: "Марко" } });
    fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "pw-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Одјави се од менаџер" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("menuitem", { name: /Смени ја мојата лозинка/ }));
    // Submitting without the current password never reaches the server —
    // the field is required, same as every other required field here.
    fireEvent.change(screen.getByLabelText("Нова лозинка"), { target: { value: "new-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
    expect(mockFetch).toHaveBeenCalledTimes(1); // only the elevate call so far — no change-password call fired

    fireEvent.change(screen.getByLabelText("Тековна лозинка"), { target: { value: "wrong-current" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
    expect(await screen.findByText("Тековната лозинка не е точна.")).toBeInTheDocument();
    // Still elevated — a wrong current password doesn't touch the session.
    expect(screen.getByText("Менаџер: Марко")).toBeInTheDocument();
  });

  it("Откажи leaves the manager login form and forgets what was typed", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));
    fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "secret-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Откажи" }));
    expect(screen.queryByLabelText("Лозинка")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));
    expect(screen.getByLabelText("Лозинка")).toHaveValue("");
  });

  it("announces a failed manager login to screen readers", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "Погрешно име или лозинка." }) });
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));
    fireEvent.change(screen.getByLabelText("Име"), { target: { value: "Марко" } });
    fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Погрешно име или лозинка.");
  });
});

