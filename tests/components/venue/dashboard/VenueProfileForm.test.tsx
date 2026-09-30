import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const lib = vi.hoisted(() => ({
  updateVenueProfile: vi.fn(),
  uploadVenueLogo: vi.fn(),
  removeVenueLogo: vi.fn(),
}));
vi.mock("@/lib/venue/venue-profile", async (importOriginal) => ({ ...(await importOriginal<object>()), ...lib }));

import { VenueProfileForm } from "@/components/venue/dashboard/VenueProfileForm";

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function file(name: string, bytes: number[], type: string, size?: number): File {
  const f = new File([new Uint8Array(bytes)], name, { type });
  if (size) Object.defineProperty(f, "size", { value: size });
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  lib.updateVenueProfile.mockResolvedValue(undefined);
  lib.uploadVenueLogo.mockResolvedValue("https://cdn.test/v1/logo-2.png");
  lib.removeVenueLogo.mockResolvedValue(undefined);
});

describe("VenueProfileForm (B10)", () => {
  it("saves address and phone", async () => {
    render(<VenueProfileForm venueId="v1" address={null} phone={null} logoUrl={null} />);
    fireEvent.change(screen.getByLabelText("Адреса"), { target: { value: "ул. Маршал Тито 1, Радовиш" } });
    fireEvent.change(screen.getByLabelText("Телефон"), { target: { value: "+389 70 111 222" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај профил" }));
    await waitFor(() =>
      expect(lib.updateVenueProfile).toHaveBeenCalledWith("v1", { address: "ул. Маршал Тито 1, Радовиш", phone: "+389 70 111 222" }),
    );
    expect(await screen.findByText("Зачувано.")).toBeInTheDocument();
  });

  it("uploads a logo and shows it", async () => {
    render(<VenueProfileForm venueId="v1" address={null} phone={null} logoUrl={null} />);
    fireEvent.change(screen.getByLabelText("Лого"), { target: { files: [file("logo.png", PNG_HEAD, "image/png")] } });
    await waitFor(() => expect(lib.uploadVenueLogo).toHaveBeenCalled());
    expect(await screen.findByRole("img", { name: "Лого на локалот" })).toHaveAttribute("src", "https://cdn.test/v1/logo-2.png");
  });

  it("refuses a file that is not a picture or is too big", async () => {
    render(<VenueProfileForm venueId="v1" address={null} phone={null} logoUrl={null} />);
    fireEvent.change(screen.getByLabelText("Лого"), { target: { files: [file("logo.svg", [0x3c, 0x73, 0x76, 0x67], "image/svg+xml")] } });
    expect(await screen.findByText("Дозволени се PNG, JPG, WEBP до 5 MB.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Лого"), { target: { files: [file("big.png", PNG_HEAD, "image/png", 6 * 1024 * 1024)] } });
    await waitFor(() => expect(screen.getAllByText("Дозволени се PNG, JPG, WEBP до 5 MB.")).toHaveLength(1));
    expect(lib.uploadVenueLogo).not.toHaveBeenCalled();
  });

  it("removes the logo", async () => {
    render(<VenueProfileForm venueId="v1" address="Адреса" phone="070" logoUrl="https://cdn.test/v1/logo-1.png" />);
    fireEvent.click(screen.getByRole("button", { name: "Отстрани лого" }));
    await waitFor(() => expect(lib.removeVenueLogo).toHaveBeenCalledWith("v1"));
    expect(screen.queryByRole("img", { name: "Лого на локалот" })).not.toBeInTheDocument();
  });
});
