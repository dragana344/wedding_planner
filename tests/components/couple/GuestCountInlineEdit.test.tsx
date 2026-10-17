import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GuestCountInlineEdit } from "@/components/couple/GuestCountInlineEdit";

function mockFetch(ok = true, body: unknown = { ok: true }) {
  global.fetch = vi.fn().mockResolvedValue({ ok, json: async () => body });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GuestCountInlineEdit", () => {
  it("shows an 'add' prompt when there's no estimate yet, and the button otherwise", () => {
    render(<GuestCountInlineEdit initialValue={null} />);
    expect(screen.getByText("Додајте број на гости")).toBeInTheDocument();
    const { unmount } = render(<GuestCountInlineEdit initialValue={120} />);
    expect(screen.getByText("120 гости")).toBeInTheDocument();
    unmount();
  });

  it("clicking turns the button into an input, Enter saves through the existing API call", async () => {
    mockFetch();
    render(<GuestCountInlineEdit initialValue={120} />);
    fireEvent.click(screen.getByRole("button", { name: "Промени број на гости" }));
    const input = screen.getByLabelText("Број на гости");
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/guest-count",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ guest_count_estimate: 150 }) }),
      ),
    );
    expect(await screen.findByText("Зачувано")).toBeInTheDocument();
    expect(screen.getByText("150 гости")).toBeInTheDocument();
  });

  it("Escape cancels without saving", () => {
    mockFetch();
    render(<GuestCountInlineEdit initialValue={120} />);
    fireEvent.click(screen.getByRole("button", { name: "Промени број на гости" }));
    const input = screen.getByLabelText("Број на гости");
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText("120 гости")).toBeInTheDocument();
  });

  it("blur saves too, and clearing the field saves null", async () => {
    mockFetch();
    render(<GuestCountInlineEdit initialValue={120} />);
    fireEvent.click(screen.getByRole("button", { name: "Промени број на гости" }));
    const input = screen.getByLabelText("Број на гости");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/guest-count",
        expect.objectContaining({ body: JSON.stringify({ guest_count_estimate: null }) }),
      ),
    );
    expect(await screen.findByText("Додајте број на гости")).toBeInTheDocument();
  });

  it("shows an error and keeps the old value when the save fails", async () => {
    mockFetch(false, { error: "Не успеа." });
    render(<GuestCountInlineEdit initialValue={120} />);
    fireEvent.click(screen.getByRole("button", { name: "Промени број на гости" }));
    fireEvent.change(screen.getByLabelText("Број на гости"), { target: { value: "200" } });
    fireEvent.keyDown(screen.getByLabelText("Број на гости"), { key: "Enter" });

    expect(await screen.findByText("Не успеа.")).toBeInTheDocument();
    expect(screen.getByText("120 гости")).toBeInTheDocument();
  });
});
