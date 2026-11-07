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
  it("starts with no type, no seating mode, a default guest count, and any preset room ids pre-checked", () => {
    const s = initialWizardState(["r1"]);
    expect(s.type).toBeNull();
    expect(s.seatingMode).toBeNull();
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

  it("step 1 requires a seating mode (Project A §1)", () => {
    expect(validateStep(1, state())).toBe("Изберете начин на седење");
    expect(validateStep(1, state({ seatingMode: "full" }))).toBeNull();
    expect(validateStep(1, state({ seatingMode: "mini" }))).toBeNull();
  });

  it("step 2 requires a name, worded for weddings vs other types", () => {
    expect(validateStep(2, state({ type: "wedding" }))).toBe("Внесете ги имињата на младенците");
    expect(validateStep(2, state({ type: "birthday" }))).toBe("Внесете име на прославата");
    expect(validateStep(2, state({ type: "wedding", name: "Ана и Петар" }))).toBeNull();
  });

  it("step 3 requires a date", () => {
    expect(validateStep(3, state())).toBe("Изберете датум");
    expect(validateStep(3, state({ date: "2027-06-01" }))).toBeNull();
  });

  it("step 4 (guests) and step 5 (rooms/menu) have no required fields for a full event with no rooms picked yet", () => {
    expect(validateStep(4, state({ seatingMode: "full" }))).toBeNull();
    expect(validateStep(5, state({ seatingMode: "full" }))).toBeNull();
  });

  it("step 5: a full event needs every selected room's layout resolved (picked or built)", () => {
    expect(validateStep(5, state({ seatingMode: "full", roomIds: ["r1"] }))).toBe(
      "Изберете или создајте распоред за секоја избрана сала",
    );
    expect(validateStep(5, state({ seatingMode: "full", roomIds: ["r1"], roomLayouts: { r1: [] } }))).toBeNull();
    expect(validateStep(5, state({ seatingMode: "full", roomIds: ["r1", "r2"], roomLayouts: { r1: [] } }))).toBe(
      "Изберете или создајте распоред за секоја избрана сала",
    );
    expect(
      validateStep(5, state({ seatingMode: "full", roomIds: ["r1", "r2"], roomLayouts: { r1: [], r2: [] } })),
    ).toBeNull();
  });

  it("a mini-event additionally requires a start time (step 3) and exactly one room (step 5, Project B §2)", () => {
    expect(validateStep(3, state({ seatingMode: "mini", date: "2027-06-01" }))).toBe("Изберете почетно време");
    expect(validateStep(3, state({ seatingMode: "mini", date: "2027-06-01", startTime: "18:00" }))).toBeNull();

    expect(validateStep(5, state({ seatingMode: "mini" }))).toBe("Изберете една сала");
    expect(validateStep(5, state({ seatingMode: "mini", roomIds: ["r1", "r2"] }))).toBe("Изберете една сала");
    expect(validateStep(5, state({ seatingMode: "mini", roomIds: ["r1"] }))).toBeNull();
  });

  it("step 6 rejects a deposit larger than the total price", () => {
    expect(validateStep(6, state({ totalPrice: "100", depositPaid: "150" }))).toBe(
      "Капарот не може да биде поголем од вкупната цена.",
    );
    expect(validateStep(6, state({ totalPrice: "100", depositPaid: "50" }))).toBeNull();
    expect(validateStep(6, state())).toBeNull();
  });

  it("step 7 requires a username and a password of at least 10 characters", () => {
    expect(validateStep(7, state())).toBe("Внесете корисничко име");
    expect(validateStep(7, state({ username: "ana-petar", password: "short" }))).toBe(
      "Лозинката треба да има најмалку 10 знаци",
    );
    expect(validateStep(7, state({ username: "ana-petar", password: "a-strong-password" }))).toBeNull();
  });

  it("step 8 requires a working email and phone (A21), reusing parseCoupleContacts' messages", () => {
    expect(validateStep(8, state())).toBe("Внесете email на парот.");
    expect(validateStep(8, state({ contactEmail: "couple@example.com" }))).toBe("Внесете телефон на парот.");
    expect(
      validateStep(8, state({ contactEmail: "couple@example.com", contactPhone: "070 123 456" })),
    ).toBeNull();
  });

  it("WIZARD_STEP_COUNT is 9", () => {
    expect(WIZARD_STEP_COUNT).toBe(9);
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
  it("returns 9 [title, subtitle] pairs", () => {
    const titles = wizardStepTitles("wedding");
    expect(titles).toHaveLength(WIZARD_STEP_COUNT);
    for (const t of titles) expect(t).toHaveLength(2);
  });

  it("wording the name/credentials/contact steps around 'the couple' for weddings", () => {
    const [, , nameStep, , , , , credentialsStep, contactStep] = wizardStepTitles("wedding");
    expect(nameStep[0]).toBe("Кои се младенците?");
    expect(credentialsStep[0]).toContain("младенците");
    expect(contactStep[1]).toContain("младенците");
  });

  it("wording those same steps around 'the organizers' for non-wedding types", () => {
    const [, , nameStep, , , , , credentialsStep, contactStep] = wizardStepTitles("birthday");
    expect(nameStep[0]).toBe("Како се вика прославата?");
    expect(credentialsStep[0]).toContain("организаторите");
    expect(contactStep[1]).toContain("организаторите");
  });
});
