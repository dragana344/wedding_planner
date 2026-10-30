import { describe, it, expect } from "vitest";
import {
  initialWizardState,
  nameChanged,
  validateStep,
  wizardWho,
  wizardStepTitles,
  WIZARD_STEP_COUNT,
  type WizardState,
} from "@/lib/venue/event-wizard";

function state(partial: Partial<WizardState> = {}): WizardState {
  return { ...initialWizardState(), ...partial };
}

describe("initialWizardState", () => {
  it("starts with no type, a default guest count, and any preset room ids pre-checked", () => {
    const s = initialWizardState(["r1"]);
    expect(s.type).toBeNull();
    expect(s.guestCount).toBe(120);
    expect(s.roomIds).toEqual(["r1"]);
    expect(s.status).toBe("preparation");
  });

  it("defaults to no preset rooms when none are given", () => {
    expect(initialWizardState().roomIds).toEqual([]);
  });
});

describe("nameChanged", () => {
  it("suggests a transliterated username from the name until the username is hand-edited", () => {
    const result = nameChanged(state(), "Ивана & Марко");
    expect(result.name).toBe("Ивана & Марко");
    expect(result.username).toBe("ivana-marko");
  });

  it("stops recomputing the suggestion once the venue has touched the username field", () => {
    const touched = state({ usernameTouched: true, username: "custom-name" });
    const result = nameChanged(touched, "Ивана & Марко");
    expect(result.username).toBe("custom-name");
  });
});

describe("validateStep", () => {
  it("step 0 requires a type", () => {
    expect(validateStep(0, state())).toBe("Изберете тип на настан");
    expect(validateStep(0, state({ type: "wedding" }))).toBeNull();
  });

  it("step 1 requires a name, worded for weddings vs other types", () => {
    expect(validateStep(1, state({ type: "wedding" }))).toBe("Внесете ги имињата на младенците");
    expect(validateStep(1, state({ type: "birthday" }))).toBe("Внесете име на прославата");
    expect(validateStep(1, state({ type: "wedding", name: "Ана и Петар" }))).toBeNull();
  });

  it("step 2 requires a date", () => {
    expect(validateStep(2, state())).toBe("Изберете датум");
    expect(validateStep(2, state({ date: "2027-06-01" }))).toBeNull();
  });

  it("step 3 (guests) and step 4 (rooms/menu) have no required fields", () => {
    expect(validateStep(3, state())).toBeNull();
    expect(validateStep(4, state())).toBeNull();
  });

  it("step 5 rejects a deposit larger than the total price", () => {
    expect(validateStep(5, state({ totalPrice: "100", depositPaid: "150" }))).toBe(
      "Капарот не може да биде поголем од вкупната цена.",
    );
    expect(validateStep(5, state({ totalPrice: "100", depositPaid: "50" }))).toBeNull();
    expect(validateStep(5, state())).toBeNull();
  });

  it("step 6 requires a username and a password of at least 10 characters", () => {
    expect(validateStep(6, state())).toBe("Внесете корисничко име");
    expect(validateStep(6, state({ username: "ana-petar", password: "short" }))).toBe(
      "Лозинката треба да има најмалку 10 знаци",
    );
    expect(validateStep(6, state({ username: "ana-petar", password: "a-strong-password" }))).toBeNull();
  });

  it("step 7 requires a working email and phone (A21), reusing parseCoupleContacts' messages", () => {
    expect(validateStep(7, state())).toBe("Внесете email на парот.");
    expect(validateStep(7, state({ contactEmail: "couple@example.com" }))).toBe("Внесете телефон на парот.");
    expect(
      validateStep(7, state({ contactEmail: "couple@example.com", contactPhone: "070 123 456" })),
    ).toBeNull();
  });

  it("WIZARD_STEP_COUNT is 8", () => {
    expect(WIZARD_STEP_COUNT).toBe(8);
  });
});

describe("wizardWho", () => {
  it("is the couple for weddings, the organizers for everything else", () => {
    expect(wizardWho("wedding")).toBe("младенците");
    expect(wizardWho("birthday")).toBe("организаторите");
    expect(wizardWho(null)).toBe("организаторите");
  });
});

describe("wizardStepTitles", () => {
  it("returns 8 [title, subtitle] pairs", () => {
    const titles = wizardStepTitles("wedding");
    expect(titles).toHaveLength(WIZARD_STEP_COUNT);
    for (const t of titles) expect(t).toHaveLength(2);
  });

  it("wording the name/credentials/contact steps around 'the couple' for weddings", () => {
    const [, nameStep, , , , , credentialsStep, contactStep] = wizardStepTitles("wedding");
    expect(nameStep[0]).toBe("Кои се младенците?");
    expect(credentialsStep[0]).toContain("младенците");
    expect(contactStep[1]).toContain("младенците");
  });

  it("wording those same steps around 'the organizers' for non-wedding types", () => {
    const [, nameStep, , , , , credentialsStep, contactStep] = wizardStepTitles("birthday");
    expect(nameStep[0]).toBe("Како се вика прославата?");
    expect(credentialsStep[0]).toContain("организаторите");
    expect(contactStep[1]).toContain("организаторите");
  });
});
