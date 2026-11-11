import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BudgetClient } from "@/components/couple/BudgetClient";

const baseSummary = {
  venue: { estimated_amount: 9000, paid_amount: 2000 },
  items: [
    {
      id: "b1",
      event_id: "e1",
      category: "catering",
      custom_label: null,
      name: "Restaurant X",
      estimated_amount: 5000,
      paid_amount: 1000,
      paid_by: null,
      payment_date: null,
      notes: null,
      created_at: "2026-01-01",
    },
  ],
  totalEstimated: 14000,
  totalPaid: 3000,
  remaining: 11000,
};

function expandCategory(label: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(label, "i") }));
}

describe("BudgetClient", () => {
  it("renders the venue line and stat cards, and expanding a category reveals its items", () => {
    render(<BudgetClient coupleNames="Ана и Марко" initialSummary={baseSummary} />);

    expect(screen.getByText("Локал")).toBeInTheDocument();
    expect(screen.getByText("Фиксно")).toBeInTheDocument();
    expect(screen.getByText("14.000 ден")).toBeInTheDocument();
    expect(screen.getByText("3.000 ден")).toBeInTheDocument();
    expect(screen.getByText("11.000 ден")).toBeInTheDocument();
    expect(screen.getByText("21%")).toBeInTheDocument();
    expect(screen.getByText("79%")).toBeInTheDocument();

    expect(screen.queryByText("Restaurant X")).not.toBeInTheDocument();
    expandCategory("кетеринг");
    expect(screen.getByText("Restaurant X")).toBeInTheDocument();
  });

  it("adds a new item via the form", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "b2",
        event_id: "e1",
        category: "flowers_decor",
        custom_label: null,
        name: "Florist Y",
        estimated_amount: 800,
        paid_amount: 0,
        paid_by: null,
        payment_date: null,
        notes: null,
        created_at: "2026-01-02",
      }),
    });
    render(<BudgetClient coupleNames="Ана и Марко" initialSummary={baseSummary} />);

    fireEvent.change(screen.getByLabelText("Име на ставка"), { target: { value: "Florist Y" } });
    fireEvent.change(screen.getByLabelText("Проценет износ"), { target: { value: "800" } });
    fireEvent.click(screen.getByRole("button", { name: /додади ставка/i }));

    await waitFor(() => expect(screen.getByText("Florist Y")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith("/api/couple/budget", expect.objectContaining({ method: "POST" }));
  });

  it("edits an existing item", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...baseSummary.items[0], name: "Restaurant X (confirmed)", paid_amount: 2000 }),
    });
    render(<BudgetClient coupleNames="Ана и Марко" initialSummary={baseSummary} />);
    expandCategory("кетеринг");

    fireEvent.click(screen.getByRole("button", { name: /измени restaurant x/i }));
    fireEvent.change(screen.getByDisplayValue("Restaurant X"), { target: { value: "Restaurant X (confirmed)" } });
    fireEvent.click(screen.getByRole("button", { name: /зачувај/i }));

    await waitFor(() => expect(screen.getByText("Restaurant X (confirmed)")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith("/api/couple/budget/b1", expect.objectContaining({ method: "PATCH" }));
  });

  it("deletes an item", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<BudgetClient coupleNames="Ана и Марко" initialSummary={baseSummary} />);
    expandCategory("кетеринг");

    fireEvent.click(screen.getByRole("button", { name: /избриши restaurant x/i }));

    await waitFor(() => expect(screen.queryByText("Restaurant X")).not.toBeInTheDocument());
  });

  it("shows an empty message when there is no venue line and no items", () => {
    render(
      <BudgetClient
        coupleNames="Ана и Марко"
        initialSummary={{ venue: { estimated_amount: null, paid_amount: null }, items: [], totalEstimated: 0, totalPaid: 0, remaining: 0 }}
      />,
    );
    expect(screen.getByText("Сè уште нема додадени ставки.")).toBeInTheDocument();
  });

  it("adds a suggested item with one click, which removes it from the suggestion list and reveals it under its category", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "b3",
        event_id: "e1",
        category: "catering",
        custom_label: null,
        name: "Торта",
        estimated_amount: null,
        paid_amount: 0,
        paid_by: null,
        payment_date: null,
        notes: null,
        created_at: "2026-01-03",
      }),
    });
    render(<BudgetClient coupleNames="Ана и Марко" initialSummary={baseSummary} />);

    expect(screen.getByText("Торта")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /додади торта/i }));

    await waitFor(() => expect(screen.queryByRole("button", { name: /додади торта/i })).not.toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/budget",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          category: "catering",
          custom_label: null,
          name: "Торта",
          estimated_amount: null,
          paid_amount: 0,
          paid_by: null,
          payment_date: null,
          notes: null,
        }),
      }),
    );
    // The category auto-expands once the suggestion is added, so the new item is visible immediately.
    expect(screen.getByText("Торта", { selector: ".bg-item-name" })).toBeInTheDocument();
  });
});
