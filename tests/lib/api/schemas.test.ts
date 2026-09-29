// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  agendaUpdateBody,
  assertUuids,
  budgetItemBody,
  contactMessageBody,
  guestCountBody,
  guestCreateBody,
  guestUpdateBody,
  idParams,
  invitationBody,
  isUuid,
  menuQuantitiesBody,
  menuSelectionBody,
  noteBody,
  parseInput,
  rsvpBody,
  seatingElementCreateBody,
  seatingElementUpdateBody,
  slugParams,
  venueSignupBody,
  INVALID_INPUT_ERROR,
} from "@/lib/api/schemas";

const ID = "3f2b8c1e-9a4d-4c2e-8f1a-2b3c4d5e6f70";
const ID2 = "00000000-0000-0000-0000-000000000001";
const INJECTION = "x),menu_item_id.not.is.null";

function msg(result: ReturnType<typeof parseInput>) {
  return result.success ? null : result.error;
}

describe("uuid helpers", () => {
  it("accepts any 8-4-4-4-12 hex id and rejects everything else", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid(ID2)).toBe(true);
    expect(isUuid(ID.toUpperCase())).toBe(true);
    for (const bad of [INJECTION, "", "abc", `${ID})`, `${ID},${ID2}`, 42, null, undefined]) {
      expect(isUuid(bad)).toBe(false);
    }
  });

  it("assertUuids throws on the PostgREST injection string", () => {
    expect(() => assertUuids([ID, INJECTION], "bad id")).toThrow("bad id");
    expect(() => assertUuids([ID, ID2])).not.toThrow();
  });

  it("idParams rejects non-UUID ids", () => {
    expect(idParams.safeParse({ id: ID }).success).toBe(true);
    expect(idParams.safeParse({ id: INJECTION }).success).toBe(false);
    expect(idParams.safeParse({ id: "1" }).success).toBe(false);
  });

  it("slugParams accepts base64url slugs only", () => {
    expect(slugParams.safeParse({ slug: "aB3_-xYz9Qw0" }).success).toBe(true);
    expect(slugParams.safeParse({ slug: "a,b" }).success).toBe(false);
    expect(slugParams.safeParse({ slug: "x".repeat(65) }).success).toBe(false);
  });
});

describe("parseInput", () => {
  it("uses the default message unless the schema declares its own", () => {
    expect(msg(parseInput(budgetItemBody, { category: "nope", name: "x" }, "DEFAULT"))).toBe("DEFAULT");
    expect(msg(parseInput(guestCountBody, { guest_count_estimate: -1 }, "DEFAULT"))).toBe(
      "Бројот на гости мора да биде не-негативен број.",
    );
    expect(msg(parseInput(guestCountBody, null, "DEFAULT"))).toBe("Неважечко JSON тело");
  });
});

describe("menu schemas", () => {
  it("rejects a non-UUID menu item id in quantities", () => {
    const r = menuQuantitiesBody.safeParse({ quantities: [{ menu_item_id: INJECTION, guest_count: 3 }] });
    expect(r.success).toBe(false);
  });

  it("accepts the quantities body the menu pickers send", () => {
    const r = menuQuantitiesBody.safeParse({
      quantities: [
        { menu_item_id: ID, guest_count: 12 },
        { menu_item_id: ID2, guest_count: null },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-positive and fractional guest counts", () => {
    for (const guest_count of [0, -1, 1.5, "3"]) {
      expect(menuQuantitiesBody.safeParse({ quantities: [{ menu_item_id: ID, guest_count }] }).success).toBe(false);
    }
  });

  it("validates the selection mode and every id", () => {
    expect(menuSelectionBody.safeParse({ mode: "template", menu_template_id: ID }).success).toBe(true);
    expect(menuSelectionBody.safeParse({ mode: "custom", menu_item_ids: [ID, ID2] }).success).toBe(true);
    expect(menuSelectionBody.safeParse({ mode: "custom", menu_item_ids: [ID, INJECTION] }).success).toBe(false);
    expect(msg(parseInput(menuSelectionBody, { mode: "other" }, INVALID_INPUT_ERROR))).toBe("Непознат режим на избор.");
  });
});

describe("seating schemas", () => {
  const valid = {
    event_id: "someone-elses-event",
    room_id: ID,
    element_type: "table",
    table_type_id: ID2,
    x_cm: 150.5,
    y_cm: 0,
    width_cm: 200,
    length_cm: 150,
    label: "Маса",
  };

  it("drops fields that are not whitelisted (event_id, id, rotation, anything else)", () => {
    const r = seatingElementCreateBody.safeParse({ ...valid, id: ID, rotation_deg: 45, is_admin: true });
    expect(r.success).toBe(true);
    expect(Object.keys(r.data!).sort()).toEqual(
      ["element_type", "label", "length_cm", "room_id", "table_type_id", "width_cm", "x_cm", "y_cm"].sort(),
    );
  });

  it("rejects bad element types, ids and sizes", () => {
    expect(seatingElementCreateBody.safeParse({ ...valid, element_type: "wall" }).success).toBe(false);
    expect(seatingElementCreateBody.safeParse({ ...valid, room_id: INJECTION }).success).toBe(false);
    expect(seatingElementCreateBody.safeParse({ ...valid, width_cm: 0 }).success).toBe(false);
    expect(seatingElementCreateBody.safeParse({ ...valid, label: "x".repeat(201) }).success).toBe(false);
  });

  it("keeps the unknown-type message for element updates", () => {
    expect(msg(parseInput(seatingElementUpdateBody, { type: "teleport" }, INVALID_INPUT_ERROR))).toBe(
      "Непознат тип на ажурирање.",
    );
    expect(seatingElementUpdateBody.safeParse({ type: "rotation", rotation_deg: 90 }).success).toBe(true);
    expect(seatingElementUpdateBody.safeParse({ type: "position", x_cm: "1", y_cm: 2 }).success).toBe(false);
  });
});

describe("guest schemas", () => {
  const guest = { full_name: "Ана Петровска", phone: null, party_size: 2, notes: null, side: "bride" };

  it("accepts the body the guest form sends", () => {
    expect(guestCreateBody.safeParse(guest).success).toBe(true);
    expect(guestCreateBody.safeParse({ ...guest, side: null }).success).toBe(true);
  });

  it("rejects party_size outside 1..50 or not an integer", () => {
    for (const party_size of [0, -2, 51, 2.5, "2"]) {
      expect(guestCreateBody.safeParse({ ...guest, party_size }).success).toBe(false);
    }
  });

  it("rejects over-long names and notes", () => {
    expect(guestCreateBody.safeParse({ ...guest, full_name: "x".repeat(201) }).success).toBe(false);
    expect(guestCreateBody.safeParse({ ...guest, notes: "x".repeat(5001) }).success).toBe(false);
  });

  it("rejects bad rsvp_status / side enums", () => {
    expect(guestUpdateBody.safeParse({ type: "status", rsvp_status: "confirmed" }).success).toBe(true);
    expect(guestUpdateBody.safeParse({ type: "status", rsvp_status: "maybe" }).success).toBe(false);
    expect(guestUpdateBody.safeParse({ type: "side", side: "groom" }).success).toBe(true);
    expect(guestUpdateBody.safeParse({ type: "side", side: "left" }).success).toBe(false);
    expect(guestCreateBody.safeParse({ ...guest, side: "left" }).success).toBe(false);
  });

  it("does not let a typed body with bad fields fall through to a full edit", () => {
    expect(guestUpdateBody.safeParse({ type: "status", rsvp_status: "maybe", ...guest }).success).toBe(false);
    expect(agendaUpdateBody.safeParse({ type: "move", direction: "sideways", title: "x" }).success).toBe(false);
  });
});

describe("other couple schemas", () => {
  it("budget: enforces the category enum and non-negative money", () => {
    const item = { category: "catering", custom_label: null, name: "Торта", estimated_amount: 100, paid_amount: 0 };
    expect(budgetItemBody.safeParse(item).success).toBe(true);
    expect(budgetItemBody.safeParse({ ...item, category: "yacht" }).success).toBe(false);
    expect(budgetItemBody.safeParse({ ...item, paid_amount: -1 }).success).toBe(false);
  });

  it("invitation: bounds the template id and enforces the 300-char message cap", () => {
    expect(invitationBody.safeParse({ template_id: "rustic", message: null }).success).toBe(true);
    expect(invitationBody.safeParse({ template_id: "", message: null }).success).toBe(false);
    expect(invitationBody.safeParse({ template_id: "a b", message: null }).success).toBe(false);
    expect(invitationBody.safeParse({ template_id: "x".repeat(65), message: null }).success).toBe(false);
    expect(invitationBody.safeParse({ template_id: "rustic", message: "x".repeat(301) }).success).toBe(false);
  });

  it("notes: accepts the autosave body and caps content", () => {
    expect(noteBody.safeParse({ title: null, content: "" }).success).toBe(true);
    expect(noteBody.safeParse({ title: null, content: "x".repeat(50_001) }).success).toBe(false);
  });
});

describe("public schemas", () => {
  it("rsvp: accepts the form body and enforces party_size 1..50", () => {
    expect(rsvpBody.safeParse({ full_name: "Ана", status: "confirmed", party_size: 3 }).success).toBe(true);
    expect(rsvpBody.safeParse({ full_name: "Ана", status: "later" }).success).toBe(true);
    expect(rsvpBody.safeParse({ full_name: "Ана", attending: false, party_size: 1 }).success).toBe(true);
    expect(rsvpBody.safeParse({ full_name: "Ана", status: "confirmed", party_size: 0 }).success).toBe(false);
    expect(rsvpBody.safeParse({ full_name: "Ана", status: "confirmed", party_size: 51 }).success).toBe(false);
    expect(msg(parseInput(rsvpBody, { full_name: "Ана" }, "D"))).toBe("Внесете име и одговор.");
  });

  it("contact: keeps the required message and caps lengths", () => {
    expect(contactMessageBody.safeParse({ name: "A", email: "a@b.mk", message: "hi" }).success).toBe(true);
    expect(msg(parseInput(contactMessageBody, { name: " ", email: "a@b.mk", message: "hi" }, "D"))).toBe(
      "Name, email, and message are required.",
    );
    expect(msg(parseInput(contactMessageBody, { name: "A", email: "a@b.mk", message: "x".repeat(5001) }, "D"))).toBe(
      "Name, email, or message is too long.",
    );
  });

  it("signup: keeps the required message and caps the venue name", () => {
    expect(venueSignupBody.safeParse({ venue_name: "Ресторан" }).success).toBe(true);
    expect(msg(parseInput(venueSignupBody, { venue_name: "  " }, "D"))).toBe("Venue name is required.");
    expect(venueSignupBody.safeParse({ venue_name: "x".repeat(201) }).success).toBe(false);
  });
});

describe("location map links (SEC-025 SR-11)", () => {
  it("accepts web links and empty values, refuses other schemes", async () => {
    const { locationBody } = await import("@/lib/api/schemas");
    for (const ok of ["https://maps.app.goo.gl/abc", "http://example.com", "", null]) {
      expect(locationBody.safeParse({ label: "Сала", map_url: ok }).success, String(ok)).toBe(true);
    }
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x"]) {
      expect(locationBody.safeParse({ label: "Сала", map_url: bad }).success, bad).toBe(false);
    }
  });
});
