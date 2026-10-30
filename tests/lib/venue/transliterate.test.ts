import { describe, it, expect } from "vitest";
import { transliterateToSlug } from "@/lib/venue/transliterate";

describe("transliterateToSlug", () => {
  it("transliterates Macedonian Cyrillic couple names into a Latin slug", () => {
    expect(transliterateToSlug("Ивана & Марко")).toBe("ivana-marko");
  });

  it("lowercases plain Latin input and slugifies punctuation", () => {
    expect(transliterateToSlug("Ivana & Marko")).toBe("ivana-marko");
  });

  it("maps every Macedonian Cyrillic letter, including digraphs", () => {
    // ѓ→gj, ж→zh, ѕ→dz, љ→lj, њ→nj, ќ→kj, ц→c, ч→ch, џ→dz, ш→sh
    expect(transliterateToSlug("ѓжѕљњќцчџш")).toBe("gjzhdzljnjkjcchdzsh");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(transliterateToSlug("Ана   и!!  Петар")).toBe("ana-i-petar");
  });

  it("trims leading and trailing hyphens", () => {
    expect(transliterateToSlug("  Роденден на Ива!  ")).toBe("rodenden-na-iva");
  });

  it("truncates to 20 characters", () => {
    expect(transliterateToSlug("Многу долго име на прослава со многу зборови")).toHaveLength(20);
  });

  it("returns an empty string for input with no alphanumeric characters", () => {
    expect(transliterateToSlug("!!!")).toBe("");
  });
});
