import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PrintPlan } from "@/components/seating/print/PrintPlan";
import { TableQrCards } from "@/components/seating/print/TableQrCards";
import type { PrintRoom } from "@/lib/seating/print";

const rooms: PrintRoom[] = [
  {
    id: "r1", name: "Голема сала", widthCm: 3000, heightCm: 2000,
    items: [
      { id: "head", kind: "named-table", shape: "rect", x: 1000, y: 50, w: 600, h: 90, rotation: 0, text: "Главна маса", vertical: false },
      { id: "t1", kind: "table", shape: "circle", x: 100, y: 100, w: 180, h: 180, rotation: 0, text: "1", vertical: false },
      { id: "floor", kind: "floor", shape: "circle", x: 1000, y: 600, w: 900, h: 900, rotation: 0, text: "", vertical: false },
      { id: "music", kind: "zone", shape: "rect", x: 50, y: 1500, w: 150, h: 400, rotation: 0, text: "Музика", vertical: true },
    ],
  },
  { id: "r2", name: "Мала сала", widthCm: 1500, heightCm: 1000, items: [] },
];

describe("PrintPlan (B7)", () => {
  it("prints one A4 page per hall with the couple, date and logo", () => {
    render(<PrintPlan title="Ана & Марко" subtitle="12 јуни 2027 · Leona Lux" logoUrl="https://cdn.test/logo.png" rooms={rooms} />);
    const pages = screen.getAllByRole("region", { name: /План на сала/ });
    expect(pages).toHaveLength(2);
    expect(within(pages[0]).getByText("Ана & Марко")).toBeInTheDocument();
    expect(within(pages[0]).getByText("12 јуни 2027 · Leona Lux")).toBeInTheDocument();
    expect(within(pages[0]).getByRole("img", { name: "Лого на локалот" })).toHaveAttribute("src", "https://cdn.test/logo.png");
    expect(within(pages[0]).getByText("Главна маса")).toBeInTheDocument();
    expect(within(pages[0]).getByText("1")).toHaveClass("s3-print-num");
    expect(within(pages[0]).getByText("Музика")).toHaveAttribute("writing-mode", "vertical-rl");
  });

  it("keeps the hall's proportions in the drawing", () => {
    render(<PrintPlan title="А" subtitle="" logoUrl={null} rooms={rooms} />);
    const svg = screen.getAllByTestId("print-plan-svg")[0];
    expect(svg).toHaveAttribute("viewBox", "0 0 3000 2000");
    expect(screen.queryByRole("img", { name: "Лого на локалот" })).not.toBeInTheDocument();
  });

  it("has a print button", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PrintPlan title="А" subtitle="" logoUrl={null} rooms={rooms} />);
    fireEvent.click(screen.getByRole("button", { name: "Печати" }));
    expect(print).toHaveBeenCalled();
  });
});

describe("PrintPlan long table names (review I7)", () => {
  it("shrinks a named guest table to fit its circle, but keeps numbers big", () => {
    const room: PrintRoom = {
      id: "r", name: "Сала", widthCm: 3000, heightCm: 2000,
      items: [
        { id: "n", kind: "table", shape: "circle", x: 0, y: 0, w: 180, h: 180, rotation: 0, text: "7", vertical: false },
        { id: "l", kind: "table", shape: "circle", x: 300, y: 0, w: 180, h: 180, rotation: 0, text: "Пријатели од Битола", vertical: false },
      ],
    };
    render(<PrintPlan title="А" subtitle="" logoUrl={null} rooms={[room]} />);
    const number = Number(screen.getByText("7").getAttribute("font-size"));
    const long = Number(screen.getByText("Пријатели од Битола").getAttribute("font-size"));
    expect(number).toBeCloseTo(180 * 0.42);
    // ~0.5 em per Cyrillic letter: the name must fit inside the table's width.
    expect(long * 0.5 * "Пријатели од Битола".length).toBeLessThanOrEqual(180 * 0.9);
  });
});

describe("TableQrCards (B7)", () => {
  const cards = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, title: `Маса ${i + 1}`, room: "Голема сала", svg: `<svg data-card="${i}"></svg>` }));

  it("lays the cards out six to an A4 page, then explains how to place them", () => {
    render(<TableQrCards title="Ана & Марко" hint="Скенирај за поканата" cards={cards} />);
    const pages = screen.getAllByRole("region", { name: /QR картички/ });
    expect(pages).toHaveLength(2);
    expect(within(pages[0]).getAllByRole("figure")).toHaveLength(6);
    expect(within(pages[1]).getAllByRole("figure")).toHaveLength(1);
    expect(within(pages[0]).getByText("Маса 1")).toBeInTheDocument();
    expect(within(pages[0]).getAllByText("Скенирај за поканата")).toHaveLength(6);
    expect(screen.getByRole("region", { name: "Како се поставуваат" })).toBeInTheDocument();
  });
});
