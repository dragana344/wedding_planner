import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SupportTicketPanel } from "@/components/support/SupportTicketPanel";

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

describe("SupportTicketPanel", () => {
  it("shows past tickets and prepends a newly submitted one without a page reload", async () => {
    const existing = {
      id: "t1",
      createdAt: "2028-01-01T00:00:00Z",
      problem: "Стар проблем",
      status: "done",
      adminComment: "Решено",
    };
    render(<SupportTicketPanel endpoint="/api/venue/support" initialTickets={[existing as never]} />);
    expect(screen.getByText("Стар проблем")).toBeInTheDocument();
    expect(screen.getByText("Решено")).toBeInTheDocument();

    const newTicket = { id: "t2", createdAt: "2028-02-01T00:00:00Z", problem: "Нов проблем", status: "pending", adminComment: null };
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, ticket: newTicket }) });

    fireEvent.change(screen.getByLabelText(/^Име/), { target: { value: "Ана" } });
    fireEvent.change(screen.getByLabelText(/Проблем/), { target: { value: "Нов проблем" } });
    fireEvent.change(screen.getByLabelText(/Опис/), { target: { value: "Опис на новиот проблем" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати барање" }));

    await waitFor(() => expect(screen.getAllByText("Нов проблем")).not.toHaveLength(0));
    // Both tickets are now listed.
    expect(screen.getByText("Стар проблем")).toBeInTheDocument();
  });

  it("shows the empty state with no tickets yet", () => {
    render(<SupportTicketPanel endpoint="/api/venue/support" initialTickets={[]} />);
    expect(screen.getByText("Нема испратени барања.")).toBeInTheDocument();
  });
});
