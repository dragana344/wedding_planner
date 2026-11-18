import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DemoRequestForm } from "@/components/auth/DemoRequestForm";
import SignupPage from "@/app/signup/page";

function fill() {
  fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Марија" } });
  fireEvent.change(screen.getByLabelText("Име на локалот"), { target: { value: "Ресторан Езеро" } });
  fireEvent.change(screen.getByLabelText("Град"), { target: { value: "Охрид" } });
  fireEvent.change(screen.getByLabelText("Телефон"), { target: { value: "070 123 456" } });
  fireEvent.change(screen.getByLabelText("Е-пошта"), { target: { value: "marija@example.com" } });
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

describe("DemoRequestForm", () => {
  it("sends the demo request and shows the thank-you message", async () => {
    render(<DemoRequestForm />);
    fill();
    fireEvent.change(screen.getByLabelText(/Порака/), { target: { value: "Две сали." } });
    fireEvent.click(screen.getByRole("button", { name: "Побарај демо" }));

    expect(await screen.findByText("Ви благодариме! Ќе ве контактираме наскоро.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/venue/demo",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Марија",
          venue_name: "Ресторан Езеро",
          city: "Охрид",
          phone: "070 123 456",
          email: "marija@example.com",
          message: "Две сали.",
        }),
      }),
    );
    expect(screen.queryByRole("button", { name: "Побарај демо" })).not.toBeInTheDocument();
  });

  it("shows the server's error and keeps the form", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Премногу обиди. Обидете се подоцна." }) });
    render(<DemoRequestForm />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Побарај демо" }));

    expect(await screen.findByText("Премногу обиди. Обидете се подоцна.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Побарај демо" })).toBeInTheDocument();
  });

  it("shows a generic error when the request itself fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    render(<DemoRequestForm />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Побарај демо" }));

    expect(await screen.findByText("Барањето не се испрати. Обидете се повторно.")).toBeInTheDocument();
  });

  it("marks the message as optional and links the privacy policy", () => {
    render(<DemoRequestForm />);
    expect(screen.getByLabelText(/Порака/)).not.toBeRequired();
    expect(screen.getByLabelText("Телефон")).toBeRequired();
    expect(screen.getByRole("link", { name: "Политика за приватност" })).toHaveAttribute("href", "/privacy");
  });
});

describe("/signup", () => {
  it("is the demo request page, with no account fields", () => {
    render(<SignupPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Побарај демо" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Лозинка/i)).not.toBeInTheDocument();
  });
});
