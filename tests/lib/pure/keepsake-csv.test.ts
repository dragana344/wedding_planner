import { describe, it, expect } from "vitest";
import { budgetCsv } from "@/lib/couple/keepsake/csv";
import { albumEntryName, attachmentDisposition, safeFileName, uniqueFileNames } from "@/lib/couple/keepsake/names";
import { guestMenuText, toKeepsakeBudget } from "@/lib/couple/keepsake/types";
import { keepsakeFixture } from "./keepsake-fixture";

// Group A task 7: the "Табели" spreadsheets and the download file names.

describe("budgetCsv", () => {
  it("is UTF-8 with BOM, `;`-separated, with the venue line, every item and the totals", () => {
    const csv = budgetCsv(keepsakeFixture().budget);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Категорија;Ставка;Планирано (ден);Платено (ден);Платил;Датум на плаќање;Белешка");
    expect(lines[1]).toBe("Локал;Локал;300000;50000;;;");
    expect(lines[2]).toBe("Фотографија;Фотограф Марија;40000;20000;Ана;01.03.2027;Капаро");
    expect(lines[3]).toBe("Цвеќиња и декор;Букет;;3000;;;");
    expect(lines[4]).toBe("Вкупно;;340000;73000;;;");
    expect(lines[5]).toBe("");
  });

  it("leaves out the venue line when the venue entered nothing, and quotes and guards cells", () => {
    const csv = budgetCsv({
      venue: { estimated: null, paid: null },
      items: [{ category: "Друго", name: '=HYPERLINK("x")', estimated: 10, paid: 0, paidBy: "Ана; Марко", paymentDate: null, notes: "ред 1\nред 2" }],
      totalEstimated: 10,
      totalPaid: 0,
    });
    const body = csv.slice(1).split("\r\n").slice(1).join("\r\n");
    expect(body).not.toContain("Локал");
    expect(body).toContain(`"'=HYPERLINK(""x"")"`);
    expect(body).toContain('"Ана; Марко"');
    expect(body).toContain('"ред 1\nред 2"');
  });
});

describe("toKeepsakeBudget", () => {
  it("labels categories and keeps a custom 'other' label", () => {
    const item = { id: "1", event_id: "e", estimated_amount: 5, paid_amount: 1, paid_by: null, payment_date: null, notes: null, created_at: "t" };
    const budget = toKeepsakeBudget({
      venue: { estimated_amount: 100, paid_amount: null },
      items: [
        { ...item, category: "photography", custom_label: null, name: "Фото" },
        { ...item, category: "other", custom_label: "Бербер", name: "Фризура" },
      ],
      totalEstimated: 110,
      totalPaid: 2,
      remaining: 108,
    });
    expect(budget.items.map((i) => i.category)).toEqual(["Фотографија", "Бербер"]);
    expect(budget.venue).toEqual({ estimated: 100, paid: null });
  });
});

describe("guestMenuText", () => {
  const menus = [
    { id: "m1", name: "Месо" },
    { id: "m2", name: "Риба" },
  ];
  it("lists the chosen menus of a confirmed guest", () => {
    expect(guestMenuText({ rsvp_status: "confirmed", party_size: 3, menu_counts: { m1: 2, m2: 1 } }, menus)).toBe("Месо ×2, Риба ×1");
  });
  it("gives the whole party the only menu", () => {
    expect(guestMenuText({ rsvp_status: "confirmed", party_size: 3, menu_counts: {} }, [menus[0]])).toBe("Месо ×3");
  });
  it("is empty for a guest who is not coming", () => {
    expect(guestMenuText({ rsvp_status: "declined", party_size: 3, menu_counts: { m1: 3 } }, menus)).toBe("");
  });
});

describe("file names", () => {
  it("keeps Cyrillic, drops path and reserved characters", () => {
    expect(safeFileName("Ана Петрова", "Гостин")).toBe("Ана Петрова");
    expect(safeFileName("../../etc/passwd", "Гостин")).toBe("etc passwd");
    expect(safeFileName('Ана: "Тетка" <Роса>?', "Гостин")).toBe("Ана Тетка Роса");
    expect(safeFileName("  \u0000 ", "Гостин")).toBe("Гостин");
    expect(safeFileName(null, "Гостин")).toBe("Гостин");
    expect(safeFileName("а".repeat(200), "x")).toHaveLength(80);
  });

  it("numbers repeated names, case-insensitively", () => {
    expect(uniqueFileNames(["Ана Петрова.mp4", "Марко.mp4", "ана петрова.mp4", "Ана Петрова.mp4", "Ана Петрова (2).mp4"])).toEqual([
      "Ана Петрова.mp4",
      "Марко.mp4",
      "ана петрова (2).mp4",
      "Ана Петрова (3).mp4",
      "Ана Петрова (2) (2).mp4",
    ]);
  });

  it("names album files by number, uploader and time", () => {
    expect(albumEntryName({ path: "e/photos/x.jpg", uploaderName: "Тетка Роса", createdAt: "2027-06-12T18:05:00Z" }, 0)).toBe("001-Тетка-Роса-2005.jpg");
    expect(albumEntryName({ path: "e/photos/x.mp4", uploaderName: null, createdAt: "2027-06-12T18:05:00Z" }, 41)).toBe("042-gostin-2005.mp4");
  });

  it("sends the real name as RFC 5987 filename* with an ASCII fallback", () => {
    expect(attachmentDisposition("Свадбена книга — Ана & Марко.pdf", "svadbena-kniga.pdf")).toBe(
      `attachment; filename="svadbena-kniga.pdf"; filename*=UTF-8''${encodeURIComponent("Свадбена книга — Ана & Марко.pdf")}`,
    );
    expect(attachmentDisposition("a'(b)*.zip", 'x"y.zip')).toBe(`attachment; filename="x_y.zip"; filename*=UTF-8''a%27%28b%29%2A.zip`);
  });
});
