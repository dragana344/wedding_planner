import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GuestCountInlineEdit, ESTIMATE_INVALID_ERROR } from "@/components/couple/GuestCountInlineEdit";

function mockFetch(ok = true, body: unknown = { ok: true }) {
  global.fetch = vi.fn().mockResolvedValue({ ok, json: async () => body });
}

afterEach(() => {
  vi.restoreAllMocks();
});

function openEditor() {
  fireEvent.click(screen.getByRole("button", { name: "Промени проценка на гости" }));
  return screen.getByLabelText("Проценка на бројот на гости");
}

describe("GuestCountInlineEdit", () => {
  it("shows an 'add' prompt when there's no estimate yet, and the estimate otherwise", () => {
    render(<GuestCountInlineEdit initialValue={null} />);
    expect(screen.getByText("Додајте проценка на гости")).toBeInTheDocument();
    const { unmount } = render(<GuestCountInlineEdit initialValue={120} />);
    expect(screen.getByText("Проценка: 120")).toBeInTheDocument();
    unmount();
  });

  it("clicking turns the button into an input, Enter saves through the existing API call", async () => {
    mockFetch();
    render(<GuestCountInlineEdit initialValue={120} />);
    const input = openEditor();
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/guest-count",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ guest_count_estimate: 150 }) }),
      ),
    );
    expect(await screen.findByText("Зачувано")).toBeInTheDocument();
    expect(screen.getByText("Проценка: 150")).toBeInTheDocument();
  });

  it("the ✓ button saves too, and clearing the field saves null", async () => {
    mockFetch();
    render(<GuestCountInlineEdit initialValue={120} />);
    fireEvent.change(openEditor(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај проценка" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/guest-count",
        expect.objectContaining({ body: JSON.stringify({ guest_count_estimate: null }) }),
      ),
    );
    expect(await screen.findByText("Додајте проценка на гости")).toBeInTheDocument();
  });

  it("Escape cancels without saving", () => {
    mockFetch();
    render(<GuestCountInlineEdit initialValue={120} />);
    const input = openEditor();
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Проценка: 120")).toBeInTheDocument();
  });

  it("leaving the field saves nothing (0181: a half-typed number is never saved)", () => {
    mockFetch();
    render(<GuestCountInlineEdit initialValue={120} />);
    const input = openEditor();
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.blur(input);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Проценка на бројот на гости")).toHaveValue(2);
  });

  it("refuses an invalid number with a message, saving nothing", () => {
    mockFetch();
    render(<GuestCountInlineEdit initialValue={120} />);
    const input = openEditor();
    fireEvent.change(input, { target: { value: "12.5" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByRole("alert")).toHaveTextContent(ESTIMATE_INVALID_ERROR);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows an error and keeps the old value when the save fails", async () => {
    mockFetch(false, { error: "Не успеа." });
    render(<GuestCountInlineEdit initialValue={120} />);
    const input = openEditor();
    fireEvent.change(input, { target: { value: "200" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Не успеа.")).toBeInTheDocument();
    expect(screen.getByText("Проценка: 120")).toBeInTheDocument();
  });
});
