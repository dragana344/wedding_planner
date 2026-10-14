import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountMenu } from "@/components/venue/shell/AccountMenu";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => ({ auth: { signOut } }) }));

beforeEach(() => {
  mockPush.mockReset();
  signOut.mockClear();
});

describe("AccountMenu", () => {
  it("stays closed until clicked, and shows the venue name/role", () => {
    render(<AccountMenu venueName="Сала Езеро" userRole="Менаџер" />);
    expect(screen.getByText("Сала Езеро")).toBeInTheDocument();
    expect(screen.getByText("Менаџер")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens on click, offering Поставки and Одјави се", () => {
    render(<AccountMenu venueName="Сала Езеро" userRole="Менаџер" />);
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    expect(screen.getByRole("menuitem", { name: /Поставки/ })).toHaveAttribute("href", "/venue/settings");
    expect(screen.getByRole("menuitem", { name: /Одјави се/ })).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<AccountMenu venueName="Сала Езеро" userRole="Менаџер" />);
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on an outside click", () => {
    render(
      <div>
        <AccountMenu venueName="Сала Езеро" userRole="Менаџер" />
        <button>outside</button>
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("signs out and redirects to /login", async () => {
    render(<AccountMenu venueName="Сала Езеро" userRole="Менаџер" />);
    fireEvent.click(screen.getByRole("button", { name: /Сала Езеро/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Одјави се/ }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(mockPush).toHaveBeenCalledWith("/login");
  });
});
