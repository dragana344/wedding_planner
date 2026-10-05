import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContactForm } from "@/components/marketing/ContactForm";

describe("ContactForm", () => {
  it("submits name, email, and message to the contact API", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/име/i), { target: { value: "Ана Петровска" } });
    fireEvent.change(screen.getByLabelText(/е-пошта/i), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText(/порака/i), { target: { value: "Интересирани сме." } });
    fireEvent.click(screen.getByRole("button", { name: /send|испрати/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/venue/contact",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Ана Петровска", email: "ana@example.com", message: "Интересирани сме." }),
        })
      )
    );
    expect(await screen.findByText(/thank you|благодариме/i)).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Пораката не се испрати. Обидете се повторно." }) });
    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/име/i), { target: { value: "Ана" } });
    fireEvent.change(screen.getByLabelText(/е-пошта/i), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText(/порака/i), { target: { value: "Прашање." } });
    fireEvent.click(screen.getByRole("button", { name: /send|испрати/i }));

    expect(await screen.findByText("Пораката не се испрати. Обидете се повторно.")).toBeInTheDocument();
  });
});
