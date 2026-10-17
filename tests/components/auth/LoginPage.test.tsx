import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const auth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
};
const mockPush = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({ auth }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import LoginPage from "@/app/login/page";

// LoginPage navigates to /venue with a hard `window.location.href` assignment
// rather than router.push (see the comment in app/login/page.tsx for why) —
// jsdom's window.location can't be reassigned directly, so it's replaced
// with a stand-in that records the assignment.
let locationHref = "";
beforeEach(() => {
  locationHref = "";
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

function signIn() {
  fireEvent.change(screen.getByLabelText("Е-пошта"), { target: { value: "staff@example.com" } });
  fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "secret-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
}

beforeEach(() => {
  mockPush.mockReset();
  auth.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
});

describe("LoginPage", () => {
  it("goes straight to /venue once the password is accepted", async () => {
    render(<LoginPage />);
    signIn();
    await waitFor(() => expect(locationHref).toBe("/venue"));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "staff@example.com", password: "secret-password" });
  });

  it("shows the sign-in error and stays on the form when the password is wrong", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "invalid_credentials", message: "Invalid login credentials" } });
    render(<LoginPage />);
    signIn();
    expect(await screen.findByText("Неточен email или лозинка.")).toBeInTheDocument();
    expect(locationHref).toBe("");
  });

  it("opens the reset form from the forgotten-password link", () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Заборавена лозинка?" }));
    expect(screen.getByRole("button", { name: "Испрати линк за ресетирање" })).toBeInTheDocument();
  });
});
