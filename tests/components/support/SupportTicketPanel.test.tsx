import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SupportTicketPanel } from "@/components/support/SupportTicketPanel";

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

const ticket = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  venueId: "v1",
  eventId: null,
  submittedBy: "venue",
  name: "Марко",
  problem: "Стар проблем",
  description: "Опис на стариот проблем",
  status: "done",
  requesterUnread: false,
  lastMessageAt: "2028-01-01T10:00:00Z",
  resolvedAt: null,
  createdAt: "2028-01-01T10:00:00Z",
  ...over,
});

describe("SupportTicketPanel", () => {
  it("shows past tickets and prepends a newly submitted one without a page reload", async () => {
    render(<SupportTicketPanel endpoint="/api/venue/support" initialTickets={[ticket() as never]} />);
    expect(screen.getByText("Стар проблем")).toBeInTheDocument();
    expect(screen.getByText("Решено")).toBeInTheDocument();

    const newTicket = ticket({ id: "t2", problem: "Нов проблем", status: "new" });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, ticket: newTicket }) });

    fireEvent.change(screen.getByLabelText(/^Име/), { target: { value: "Ана" } });
    fireEvent.change(screen.getByLabelText(/Проблем/), { target: { value: "Нов проблем" } });
    fireEvent.change(screen.getByLabelText(/Опис/), { target: { value: "Опис на новиот проблем" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати барање" }));

    await waitFor(() => expect(screen.getAllByText("Нов проблем")).not.toHaveLength(0));
    expect(screen.getByText("Стар проблем")).toBeInTheDocument();
  });

  it("shows the empty state with no tickets yet", () => {
    render(<SupportTicketPanel endpoint="/api/venue/support" initialTickets={[]} />);
    expect(screen.getByText("Нема испратени барања.")).toBeInTheDocument();
  });

  it("marks an unread team reply, opens the conversation (clearing the mark) and sends a reply", async () => {
    render(<SupportTicketPanel endpoint="/api/couple/support" initialTickets={[ticket({ status: "in_progress", requesterUnread: true }) as never]} />);
    expect(screen.getByText("Нов одговор")).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ticket: ticket({ status: "in_progress", requesterUnread: false }),
        messages: [{ id: "m1", author: "admin", body: "Проверуваме го проблемот.", createdAt: "2028-01-02T09:00:00Z" }],
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Отвори разговор: Стар проблем" }));

    expect(await screen.findByText("Проверуваме го проблемот.")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("/api/couple/support/t1");
    // The ticket's own description is the conversation's first message.
    expect(screen.getByText("Опис на стариот проблем")).toBeInTheDocument();
    expect(screen.getByText("Тим за поддршка")).toBeInTheDocument();
    expect(screen.queryByText("Нов одговор")).not.toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        ticket: ticket({ status: "in_progress" }),
        message: { id: "m2", author: "requester", body: "Фала!", createdAt: "2028-01-02T10:00:00Z" },
      }),
    });
    fireEvent.change(screen.getByLabelText("Ваш одговор"), { target: { value: "  Фала!  " } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати" }));

    expect(await screen.findByText("Фала!")).toBeInTheDocument();
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe("/api/couple/support/t1");
    expect(JSON.parse(init.body)).toEqual({ body: "Фала!" });
    expect(screen.getByLabelText("Ваш одговор")).toHaveValue("");
  });

  it("shows the server's error when a reply fails and keeps the typed text", async () => {
    render(<SupportTicketPanel endpoint="/api/venue/support" initialTickets={[ticket() as never]} />);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ticket: ticket(), messages: [] }) });
    fireEvent.click(screen.getByRole("button", { name: "Отвори разговор: Стар проблем" }));
    await screen.findByLabelText("Ваш одговор");

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Пораката е предолга." }) });
    fireEvent.change(screen.getByLabelText("Ваш одговор"), { target: { value: "Текст" } });
    fireEvent.click(screen.getByRole("button", { name: "Испрати" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Пораката е предолга.");
    expect(screen.getByLabelText("Ваш одговор")).toHaveValue("Текст");
  });
});
