import { describe, it, expect } from "vitest";
import { parseCoupleContacts } from "@/lib/venue/event-contacts";

describe("parseCoupleContacts (A21)", () => {
  it("requires the couple's email and phone, trimming them; a second email is optional", () => {
    expect(parseCoupleContacts({ contact_email: " ana@example.mk ", contact_phone: " 070 123 456 ", contact_email_2: "" })).toEqual({
      ok: true,
      data: { contact_email: "ana@example.mk", contact_phone: "070 123 456", contact_email_2: null },
    });
  });

  it("names what is missing or wrong, in Macedonian", () => {
    expect(parseCoupleContacts({ contact_email: "", contact_phone: "070123456" })).toEqual({ ok: false, error: "Внесете email на парот." });
    expect(parseCoupleContacts({ contact_email: "ana", contact_phone: "070123456" })).toEqual({ ok: false, error: "Неважечки email на парот." });
    expect(parseCoupleContacts({ contact_email: "ana@example.mk", contact_phone: "  " })).toEqual({ ok: false, error: "Внесете телефон на парот." });
    expect(parseCoupleContacts({ contact_email: "ana@example.mk", contact_phone: "123" })).toEqual({ ok: false, error: "Неважечки телефон на парот." });
    expect(parseCoupleContacts({ contact_email: "ana@example.mk", contact_phone: "070123456", contact_email_2: "x" })).toEqual({
      ok: false,
      error: "Неважечка втора е-пошта.",
    });
  });
});
