import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BudgetClient } from "@/components/couple/BudgetClient";

const baseSummary = {
  venue: { estimated_amount: 9000, paid_amount: 2000 },
  items: [
    { id: "b1", event_id: "e1", category: "catering", custom_label: null, name: "Restaurant X", estimated_amount: 5000, paid_amount: 1000, created_at: "2026-01-01" },
  ],
  totalEstimated: 14000,
  totalPaid: 3000,
  remaining: 11000,
};

describe("BudgetClient", () => {
  it("renders the venue line, items, and stat tiles, and adds a new item", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "b2", event_id: "e1", category: "flowers_decor", custom_label: null, name: "Florist Y", estimated_amount: 800, paid_amount: 0, created_at: "2026-01-02" }),
    });
    render(<BudgetClient initialSummary={baseSummary} />);

    expect(screen.getByText(/локал/i)).toBeInTheDocument();
    expect(screen.getByText("Restaurant X")).toBeInTheDocument();
    expect(screen.getByText("14.000 ден")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Име на ставка"), { target: { value: "Florist Y" } });
    fireEvent.change(screen.getByPlaceholderText("Проценет износ"), { target: { value: "800" } });
    fireEvent.click(screen.getByRole("button", { name: /додади ставка/i }));

    await waitFor(() => expect(screen.getByText("Florist Y")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/budget",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("edits an existing item", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...baseSummary.items[0], name: "Restaurant X (confirmed)", paid_amount: 2000 }),
    });
    render(<BudgetClient initialSummary={baseSummary} />);

    fireEvent.click(screen.getByRole("button", { name: /измени restaurant x/i }));
    fireEvent.change(screen.getByDisplayValue("Restaurant X"), { target: { value: "Restaurant X (confirmed)" } });
    fireEvent.click(screen.getByRole("button", { name: /зачувај/i }));

    await waitFor(() => expect(screen.getByText("Restaurant X (confirmed)")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/budget/b1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("deletes an item", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<BudgetClient initialSummary={baseSummary} />);

    fireEvent.click(screen.getByRole("button", { name: /избриши restaurant x/i }));

    await waitFor(() => expect(screen.queryByText("Restaurant X")).not.toBeInTheDocument());
  });
});
