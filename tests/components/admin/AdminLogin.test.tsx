import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const auth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  getUser: vi.fn(),
  resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
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

  it("opens the panel for an admin on the password alone", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { app_metadata: { role: "platform_admin" } } }, error: null });
    render(<AdminLogin />);
    signIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
  });

  it("shows an error and stays on the form when the password is wrong", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "Invalid login credentials" } });
    render(<AdminLogin />);
    signIn();
    expect(await screen.findByText("Неточна е-пошта или лозинка.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("offers a forgot-password link that sends a reset email and can be backed out of", async () => {
    render(<AdminLogin />);
    fireEvent.click(screen.getByRole("button", { name: "Заборавена лозинка?" }));
    expect(screen.getByRole("heading", { name: "Ресетирај лозинка" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Е-пошта"), { target: { value: "admin@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати линк за ресетирање" }));
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("admin@example.com", expect.any(Object)));

    fireEvent.click(screen.getByRole("button", { name: "Назад кон најава" }));
    expect(screen.getByRole("button", { name: "Најави се" })).toBeInTheDocument();
  });
});
