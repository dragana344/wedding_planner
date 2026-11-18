import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const createVenue = vi.fn();
vi.mock("@/app/admin/(panel)/venues/actions", () => ({ createVenue: (i: unknown) => createVenue(i) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { CreateVenueForm } from "@/components/admin/CreateVenueForm";

const PLANS = [
  { id: "p-start", name: "START", isDefault: false },
  { id: "p-std", name: "Стандарден", isDefault: true },
];

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Име на локалот"), { target: { value: "Ресторан Езеро" } });
  fireEvent.change(screen.getByLabelText("Сопственик"), { target: { value: "Марија" } });
  fireEvent.change(screen.getByLabelText("Е-пошта"), { target: { value: "m@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Отвори локал" }));
}

beforeEach(() => createVenue.mockReset());

describe("CreateVenueForm (admin → Нов локал)", () => {
  it("preselects the default plan and sends the form", async () => {
    createVenue.mockResolvedValue({ ok: false, error: "x" });
    render(<CreateVenueForm plans={PLANS} />);
    expect(screen.getByLabelText("Ниво")).toHaveValue("p-std");
    fillAndSubmit();
    await screen.findByRole("alert");
    expect(createVenue).toHaveBeenCalledWith({ venueName: "Ресторан Езеро", ownerName: "Марија", email: "m@example.com", phone: undefined, planId: "p-std" });
  });

  it("shows both generated passwords once, with copy buttons and the note for the owner", async () => {
    createVenue.mockResolvedValue({
      ok: true,
      data: { venueId: "v1", email: "m@example.com", ownerName: "Марија", loginPassword: "LoginPass-123456", ownerPassword: "OwnerPass-123456", emailSent: false },
    });
    render(<CreateVenueForm plans={PLANS} />);
    fillAndSubmit();
    expect(await screen.findByText("LoginPass-123456")).toBeInTheDocument();
    expect(screen.getByText("OwnerPass-123456")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Копирај" })).toHaveLength(2);
    expect(screen.getByText("Испратете ја лозинката на сопственикот; при првото најавување ќе мора да ја смени.")).toBeInTheDocument();
    expect(screen.getByText(/не беше испратена/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    expect(screen.queryByText("LoginPass-123456")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Име на локалот")).toHaveValue("");
  });

  it("shows a duplicate-email refusal", async () => {
    createVenue.mockResolvedValue({ ok: false, error: "Веќе постои сметка со оваа е-пошта." });
    render(<CreateVenueForm plans={PLANS} />);
    fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Веќе постои сметка со оваа е-пошта.");
  });
});
