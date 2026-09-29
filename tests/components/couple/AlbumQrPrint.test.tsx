import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlbumQrPrint, parsePrintOptions } from "@/components/couple/AlbumQrPrint";

// C4: printable cards (A6, four to an A4 sheet) and a poster pointing guests
// at the album's QR page.

const CTA = "Скенирај и сподели ги твоите фотографии";

describe("parsePrintOptions", () => {
  it("defaults to eight A6 cards without table numbers", () => {
    expect(parsePrintOptions({})).toEqual({ format: "a6", count: 8, numbered: false });
  });

  it("keeps the count between 1 and 60 and ignores unknown values", () => {
    expect(parsePrintOptions({ count: "999" }).count).toBe(60);
    expect(parsePrintOptions({ count: "0" }).count).toBe(1);
    expect(parsePrintOptions({ count: "abc" }).count).toBe(8);
    expect(parsePrintOptions({ format: "letter" }).format).toBe("a6");
    expect(parsePrintOptions({ format: "a4", numbered: "1" })).toEqual({ format: "a4", count: 8, numbered: true });
  });
});

describe("AlbumQrPrint", () => {
  it("prints the requested number of cards, each with the QR code and the call to action", async () => {
    const { container } = render(<AlbumQrPrint guestPath="/e/abc" options={{ format: "a6", count: 8, numbered: false }} />);
    expect(screen.getAllByText(CTA)).toHaveLength(8);
    await waitFor(() => expect(container.querySelectorAll(".s4-card svg")).toHaveLength(8));
    expect(screen.queryByText(/^Маса/)).not.toBeInTheDocument();
  });

  it("numbers the cards by table when asked", () => {
    render(<AlbumQrPrint guestPath="/e/abc" options={{ format: "a6", count: 3, numbered: true }} />);
    expect(screen.getByText("Маса 1")).toBeInTheDocument();
    expect(screen.getByText("Маса 3")).toBeInTheDocument();
  });

  it("prints a single A4 poster", async () => {
    const { container } = render(<AlbumQrPrint guestPath="/e/abc" options={{ format: "a4", count: 8, numbered: false }} />);
    expect(screen.getAllByText(CTA)).toHaveLength(1);
    expect(container.querySelector(".s4-poster")).not.toBeNull();
  });

  it("opens the print dialog", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<AlbumQrPrint guestPath="/e/abc" options={{ format: "a6", count: 1, numbered: false }} />);
    await userEvent.click(screen.getByRole("button", { name: "Печати" }));
    expect(print).toHaveBeenCalled();
  });
});
