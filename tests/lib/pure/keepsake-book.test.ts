// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { inflateSync } from "zlib";
import { bookTitle, renderWeddingBook } from "@/lib/couple/keepsake/book";
import { emptyKeepsake, keepsakeFixture } from "./keepsake-fixture";

// Group A task 7: the wedding book PDF. Text is checked with pdftotext when
// it is installed; the embedded fonts' Cyrillic is checked on the raw bytes
// everywhere (react-pdf writes a ToUnicode map for each subset font).

function inflatedStreams(pdf: Buffer): string {
  const text = pdf.toString("latin1");
  const out: string[] = [];
  const re = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endstream", start);
    try {
      out.push(inflateSync(pdf.subarray(start, end)).toString("latin1"));
    } catch {
      // not a Flate stream (images)
    }
  }
  return out.join("\n");
}

function hasPdfToText(): boolean {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function pdfText(pdf: Buffer): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "keepsake-")), "book.pdf");
  fs.writeFileSync(file, pdf);
  // Letter-spaced headings come out as "К Н И ГА", so spaces are ignored.
  return execFileSync("pdftotext", ["-enc", "UTF-8", file, "-"]).toString().replace(/\s+/g, "");
}

describe("wedding book", () => {
  it("renders a PDF with the embedded Cyrillic fonts", async () => {
    const pdf = await renderWeddingBook(keepsakeFixture());
    if (process.env.KEEPSAKE_SAMPLE_PDF) fs.writeFileSync(process.env.KEEPSAKE_SAMPLE_PDF, pdf);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const raw = pdf.toString("latin1");
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+CormorantGaramond/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Montserrat/);
    // "А" (U+0410) and "ч" (U+0447) are mapped in a subset's ToUnicode CMap.
    const streams = inflatedStreams(pdf).toUpperCase();
    expect(streams).toContain("<0410>");
    expect(streams).toContain("<0447>");
  }, 30_000);

  it.runIf(hasPdfToText())("contains every section's text", async () => {
    const text = pdfText(await renderWeddingBook(keepsakeFixture()));
    for (const expected of [
      "СВАДБЕНА КНИГА",
      "Ана & Марко",
      "сабота, 12 јуни 2027",
      "Ресторан Езеро",
      "Со чест Ве покануваме",
      "Програма на денот",
      "Пречек на гостите",
      "Плаошник, Охрид",
      "Борис Стојанов",
      "Кумовска маса",
      "Ви посакуваме љубов, среќа и многу насмевки!",
      "со видео",
      "Јагнешко печено",
      "Фотограф Марија",
      "340.000 ден",
      "Нарачај торта",
      "Perfect — Ed Sheeran",
      "Ти си мојата љубов",
    ]) {
      expect(text).toContain(expected.replace(/\s+/g, ""));
    }
  }, 30_000);

  it.runIf(hasPdfToText())("leaves out sections with no content", async () => {
    const text = pdfText(await renderWeddingBook(emptyKeepsake()));
    expect(text).toContain("Ана&Марко");
    for (const missing of ["Покана", "Програма на денот", "Гости", "Распоред на маси", "Честитки", "Буџет", "Чеклиста", "Белешки"]) {
      expect(text.toLowerCase()).not.toContain(missing.replace(/\s+/g, "").toLowerCase());
    }
  }, 30_000);

  it("runs a large wedding over many pages", async () => {
    const base = keepsakeFixture();
    const guests = Array.from({ length: 300 }, (_, i) => ({ ...base.guests[i % 3], fullName: `Гостин ${i + 1}` }));
    const greetings = Array.from({ length: 40 }, (_, i) => ({ ...base.greetings[0], message: "Честито! ".repeat(i * 5 + 1) }));
    const pdf = await renderWeddingBook({ ...base, guests, greetings });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(15);
  }, 60_000);

  it("names the book by event type", () => {
    expect(bookTitle({ isWedding: true })).toBe("Свадбена книга");
    expect(bookTitle({ isWedding: false })).toBe("Спомен-книга");
  });
});
