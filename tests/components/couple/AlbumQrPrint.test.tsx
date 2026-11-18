import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { designsFor, defaultDesign, parsePrintDesign } from "@/lib/media/print-designs";
import { AlbumQrPrint } from "@/components/couple/AlbumQrPrint";
import { parsePrintOptions } from "@/lib/media/print-options";

// next/font is compiled by Next, not available under jsdom.
vi.mock("next/font/google", () => ({
  Comfortaa: () => ({ className: "hand-font" }),
  Cormorant_Garamond: () => ({ className: "serif-font" }),
  Montserrat: () => ({ className: "sans-font" }),
  Great_Vibes: () => ({ className: "script-font" }),
  Pacifico: () => ({ className: "playful-font" }),
}));

// C4: printable cards (A6, four to an A4 sheet) and a poster pointing guests
// at the album's QR page.

const CTA = "Скенирај и сподели ги твоите фотографии и видеа";

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

describe("print designs", () => {
  it("offers the designs made for the event type, then the classic card", () => {
    expect(designsFor("wedding").map((d) => d.id)).toEqual(["wedding-elegant", "wedding-forever", "wedding-romantic", "classic"]);
    expect(designsFor("birthday").map((d) => d.id)).toEqual(["birthday-neutral", "birthday-pink", "birthday-blue", "classic"]);
    expect(designsFor("baptism").map((d) => d.id)).toEqual(["baptism-gold", "baptism-blue", "baptism-pink", "classic"]);
    expect(designsFor("graduation").map((d) => d.id)).toEqual(["graduation-navy", "graduation-forest", "graduation-burgundy", "classic"]);
  });

  it("starts with the design made for the event type, and ignores a design that isn't offered for it", () => {
    expect(defaultDesign("wedding")).toBe("wedding-elegant");
    expect(defaultDesign("graduation")).toBe("graduation-navy");
    expect(defaultDesign("something_new")).toBe("classic");
    expect(parsePrintDesign({}, "birthday")).toBe("birthday-neutral");
    expect(parsePrintDesign({ design: "birthday-blue" }, "birthday")).toBe("birthday-blue");
    expect(parsePrintDesign({ design: "classic" }, "birthday")).toBe("classic");
    expect(parsePrintDesign({ design: "wedding-forever" }, "birthday")).toBe("birthday-neutral");
    expect(parsePrintDesign({ design: "nope" }, "wedding")).toBe("wedding-elegant");
    expect(parsePrintDesign({ design: ["classic", "x"] }, "wedding")).toBe("classic");
  });
});

describe("AlbumQrPrint designs", () => {
  const opts = { format: "a6" as const, count: 2, numbered: true };

  it("draws the wedding design with its heading on every card, and keeps the QR and the text", async () => {
    const { container } = render(<AlbumQrPrint guestPath="/e/abc" options={opts} eventType="wedding" design="wedding-forever" />);
    expect(screen.getAllByText("Forever")).toHaveLength(2);
    expect(container.querySelectorAll(".s4-designed .s4-art")).toHaveLength(2);
    expect(screen.getAllByText(CTA)).toHaveLength(2);
    expect(screen.getByText("Маса 2")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelectorAll(".s4-card-qr svg")).toHaveLength(2));
  });

  it("draws the birthday design, and the same on the A4 poster", () => {
    const { container, unmount } = render(<AlbumQrPrint guestPath="/e/abc" options={opts} eventType="birthday" design="birthday-pink" />);
    expect(screen.getAllByText("Среќен роденден")).toHaveLength(2);
    unmount();
    const poster = render(<AlbumQrPrint guestPath="/e/abc" options={{ ...opts, format: "a4" }} eventType="birthday" design="birthday-pink" />);
    expect(poster.container.querySelector(".s4-poster.s4-designed .s4-art")).not.toBeNull();
    expect(screen.getByText("Среќен роденден")).toBeInTheDocument();
    void container;
  });

  it("hands the design's colours to the card as CSS variables", () => {
    const { container } = render(<AlbumQrPrint guestPath="/e/abc" options={opts} eventType="wedding" design="wedding-romantic" />);
    const card = container.querySelector(".s4-card") as HTMLElement;
    expect(card.style.getPropertyValue("--pd-bg")).toBe("#fdf1f0");
    expect(card.style.getPropertyValue("--pd-accent")).toBe("#c9606e");
  });

  it("leaves the classic card without artwork, and lists the event's designs in the picker", () => {
    const { container } = render(<AlbumQrPrint guestPath="/e/abc" options={opts} eventType="wedding" design="classic" />);
    expect(container.querySelector(".s4-art")).toBeNull();
    const picker = screen.getByLabelText("Дизајн") as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.value)).toEqual(["wedding-elegant", "wedding-forever", "wedding-romantic", "classic"]);
    expect(picker.value).toBe("classic");
  });
});

describe("designs for every event type", () => {
  const ids = (eventType: string) => designsFor(eventType).map((d) => d.id);

  it("gives every event type its own designs, the elegant simple one first, then the classic card", () => {
    const types = ["wedding", "birthday", "baby_shower", "baptism", "graduation", "anniversary", "family", "new_year", "school", "corporate", "conference", "presentation", "seminar", "team_building", "other"];
    for (const type of types) {
      const list = ids(type);
      expect(list.length, type).toBeGreaterThanOrEqual(2);
      expect(list.at(-1), type).toBe("classic");
      expect(defaultDesign(type), type).toBe(list[0]);
    }
    expect(ids("corporate")).toEqual(ids("team_building"));
  });

  it("offers blue, pink and neutral for birthday and baby shower", () => {
    expect(ids("birthday")).toEqual(["birthday-neutral", "birthday-pink", "birthday-blue", "classic"]);
    expect(ids("baby_shower")).toEqual(["babyshower-neutral", "babyshower-pink", "babyshower-blue", "classic"]);
  });

  it("falls back to the classic card for an event type with no designs", () => {
    expect(ids("something_new")).toEqual(["classic"]);
  });

  it("every design has artwork, a heading font and a way into every event type it is meant for", async () => {
    const { PRINT_DESIGNS } = await import("@/lib/media/print-designs");
    for (const d of PRINT_DESIGNS.filter((x) => x.id !== "classic")) {
      const { container, unmount } = render(<AlbumQrPrint guestPath="/e/abc" options={{ format: "a6", count: 1, numbered: true }} eventType={d.eventTypes[0]} design={d.id} />);
      expect(container.querySelector(".s4-art"), d.id).not.toBeNull();
      expect(container.querySelector(".s4-card-heading"), d.id).not.toBeNull();
      unmount();
    }
  });
});
