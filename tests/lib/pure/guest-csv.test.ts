import { describe, it, expect } from "vitest";
import { guestsToCsv, parseGuestCsv, GUEST_IMPORT_MAX_ROWS } from "@/lib/couple/guest-csv";
import type { Guest } from "@/lib/couple/guests";

const base: Guest = {
  id: "g1",
  event_id: "e1",
  full_name: "Ана Петровска",
  phone: "070 111 222",
  party_size: 3,
  rsvp_status: "confirmed",
  notes: null,
  side: "bride",
  invite_token: "secret-token-not-exported-xx",
  email: "ana@example.mk",
  children_count: 1,
  menu_choice: "posno",
  allergies: "ореви",
  rsvp_comment: "Доаѓаме, \"со радост\"",
  invitation_sent_at: "2027-01-15T10:00:00.000Z",
  invitation_channel: "viber",
};

describe("guestsToCsv (A20)", () => {
  it("writes a BOM, Macedonian headers and one line per guest, quoting where needed", () => {
    const csv = guestsToCsv([base]);
    expect(csv.startsWith("﻿")).toBe(true);
    const [header, line] = csv.slice(1).split("\r\n");
    expect(header).toBe("Име и презиме,Телефон,Email,Страна,Лица,Деца,Статус,Мени,Алергии,Коментар,Покана испратена");
    expect(line).toBe('Ана Петровска,070 111 222,ana@example.mk,Невеста,3,1,Потврден,Посно,ореви,"Доаѓаме, ""со радост""",Да (viber)');
  });

  it("never exports the personal invite token", () => {
    expect(guestsToCsv([base])).not.toContain(base.invite_token);
  });

  it("defuses spreadsheet formulas in guest-typed text", () => {
    const csv = guestsToCsv([{ ...base, full_name: "=HYPERLINK(\"x\")", rsvp_comment: "+1", allergies: "@a", phone: "-5" }]);
    const line = csv.split("\r\n")[1];
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
    expect(line).toContain("'+1");
    expect(line).toContain("'@a");
    expect(line).toContain("'-5");
  });

  it("leaves blanks for missing values and marks unsent invitations", () => {
    const line = guestsToCsv([
      { ...base, phone: null, email: null, side: null, menu_choice: null, allergies: null, rsvp_comment: null, invitation_sent_at: null, invitation_channel: null, rsvp_status: "later" },
    ]).split("\r\n")[1];
    expect(line).toBe("Ана Петровска,,,,3,1,Ќе одговори подоцна,,,,Не");
  });
});

describe("parseGuestCsv (A20)", () => {
  it("reads Macedonian headers, any column order, a BOM and CRLF", () => {
    const text = "﻿Телефон,Име и презиме,Лица,Страна,Email\r\n070 111,Ана,2,невеста,ana@example.mk\r\n,Марко,,Младоженец,\r\n";
    expect(parseGuestCsv(text)).toEqual({
      rows: [
        { full_name: "Ана", phone: "070 111", email: "ana@example.mk", side: "bride", party_size: 2 },
        { full_name: "Марко", phone: null, email: null, side: "groom", party_size: 1 },
      ],
      errors: [],
    });
  });

  it("accepts English headers, semicolons and quoted fields", () => {
    const text = 'name;phone;side;party_size\n"Петровски, Петар";"071 222";bride;4\n';
    expect(parseGuestCsv(text).rows).toEqual([{ full_name: "Петровски, Петар", phone: "071 222", email: null, side: "bride", party_size: 4 }]);
  });

  it("reads back its own export", () => {
    const { rows, errors } = parseGuestCsv(guestsToCsv([base, { ...base, full_name: "=cmd", side: "groom" }]));
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { full_name: "Ана Петровска", phone: "070 111 222", email: "ana@example.mk", side: "bride", party_size: 3 },
      { full_name: "=cmd", phone: "070 111 222", email: "ana@example.mk", side: "groom", party_size: 3 },
    ]);
  });

  it("reports bad lines by number and keeps the good ones", () => {
    const text = "Име и презиме,Лица,Email,Страна\nАна,2,,\n,1,,\nМарко,0,,\nЈана,1,не-е-email,\nИва,1,,чудна\n";
    const { rows, errors } = parseGuestCsv(text);
    expect(rows.map((r) => r.full_name)).toEqual(["Ана"]);
    expect(errors).toEqual([
      { line: 3, message: "Недостасува име." },
      { line: 4, message: "Бројот на лица мора да е од 1 до 50." },
      { line: 5, message: "Неважечки email." },
      { line: 6, message: "Страната мора да е „невеста“ или „младоженец“." },
    ]);
  });

  it("needs a name column and caps the number of rows", () => {
    expect(parseGuestCsv("Телефон\n070\n")).toEqual({ rows: [], errors: [{ line: 1, message: "Недостасува колона „Име и презиме“." }] });
    const many = "Име и презиме\n" + Array.from({ length: GUEST_IMPORT_MAX_ROWS + 1 }, (_, i) => `Гостин ${i}`).join("\n");
    expect(parseGuestCsv(many).errors).toEqual([{ line: 1, message: `Најмногу ${GUEST_IMPORT_MAX_ROWS} гости во една датотека.` }]);
  });

  it("skips blank lines", () => {
    expect(parseGuestCsv("Име и презиме\n\nАна\n   \n").rows).toHaveLength(1);
  });
});
