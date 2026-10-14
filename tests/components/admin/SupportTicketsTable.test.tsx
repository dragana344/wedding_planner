import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SupportTicketRow } from "@/lib/admin/queries";

const setSupportTicketStatus = vi.hoisted(() => vi.fn());
vi.mock("@/app/admin/(panel)/support/actions", () => ({ setSupportTicketStatus }));

import { SupportTicketsTable } from "@/components/admin/SupportTicketsTable";

const venueTicket: SupportTicketRow = {
  id: "t1",
  venueId: "v1",
  venueName: "Сала Езеро",
  eventId: null,
  coupleNames: null,
  submittedBy: "venue",
  name: "Марко",
  problem: "Не работи распоредот",
  description: "Детален опис на проблемот",
  status: "pending",
  adminComment: null,
  createdAt: "2028-01-01T00:00:00Z",
};

const coupleTicket: SupportTicketRow = {
  ...venueTicket,
  id: "t2",
  eventId: "e1",
  coupleNames: "Ана и Петар",
  submittedBy: "couple",
  problem: "Прашање за менито",
  status: "done",
  adminComment: "Разговаравме телефонски",
};

beforeEach(() => setSupportTicketStatus.mockReset());

describe("SupportTicketsTable", () => {
  it("shows venue name and, for a couple ticket, the couple's names", () => {
    render(<SupportTicketsTable tickets={[venueTicket, coupleTicket]} />);
    expect(screen.getAllByText("Сала Езеро")).toHaveLength(2);
    expect(screen.getByText(/Ана и Петар/)).toBeInTheDocument();
  });

  it("marks a pending ticket done with the typed comment", async () => {
    setSupportTicketStatus.mockResolvedValue({ ok: true, data: null });
    render(<SupportTicketsTable tickets={[venueTicket]} />);

    fireEvent.change(screen.getByLabelText(`Коментар за барањето од ${venueTicket.name}`), { target: { value: "Решено, видете мејл" } });
    fireEvent.click(screen.getByRole("button", { name: "Заврши" }));

    await waitFor(() =>
      expect(setSupportTicketStatus).toHaveBeenCalledWith({ id: "t1", status: "done", adminComment: "Решено, видете мејл" }),
    );
  });

  it("re-opens a done ticket", async () => {
    setSupportTicketStatus.mockResolvedValue({ ok: true, data: null });
    render(<SupportTicketsTable tickets={[coupleTicket]} />);

    fireEvent.click(screen.getByRole("button", { name: "Врати во очекување" }));

    await waitFor(() =>
      expect(setSupportTicketStatus).toHaveBeenCalledWith({ id: "t2", status: "pending", adminComment: "Разговаравме телефонски" }),
    );
  });

  it("shows the action's error message on failure", async () => {
    setSupportTicketStatus.mockResolvedValue({ ok: false, error: "Акцијата не успеа." });
    render(<SupportTicketsTable tickets={[venueTicket]} />);
    fireEvent.click(screen.getByRole("button", { name: "Заврши" }));
    expect(await screen.findByText("Акцијата не успеа.")).toBeInTheDocument();
  });
});
