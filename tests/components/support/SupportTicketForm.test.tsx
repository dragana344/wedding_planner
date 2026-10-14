import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SupportTicketForm } from "@/components/support/SupportTicketForm";

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/Име/), { target: { value: "Марко" } });
  fireEvent.change(screen.getByLabelText(/Проблем/), { target: { value: "Не можам да зачувам" } });
  fireEvent.change(screen.getByLabelText(/Опис/), { target: { value: "Опишувам детално" } });
  fireEvent.click(screen.getByRole("button", { name: "Испрати барање" }));
}

describe("SupportTicketForm", () => {
  it("posts the three fields to the given endpoint and hands the saved ticket to onSubmitted", async () => {
    const ticket = { id: "t1", name: "Марко", problem: "Не можам да зачувам", description: "Опишувам детално", status: "pending" };
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, ticket }) });
    const onSubmitted = vi.fn();

    render(<SupportTicketForm endpoint="/api/venue/support" onSubmitted={onSubmitted} />);
    fillAndSubmit();

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(ticket));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/venue/support",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Марко", problem: "Не можам да зачувам", description: "Опишувам детално" }),
      }),
    );
    // Clears after a successful submit.
    expect(screen.getByLabelText(/^Име/)).toHaveValue("");
  });

  it("shows the server's error message and keeps the fields filled in", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Внесете име, проблем и опис." }) });
    render(<SupportTicketForm endpoint="/api/venue/support" onSubmitted={vi.fn()} />);
    fillAndSubmit();

    expect(await screen.findByText("Внесете име, проблем и опис.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Име/)).toHaveValue("Марко");
  });
});
