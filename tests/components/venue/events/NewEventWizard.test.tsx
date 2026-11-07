import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewEventWizard } from "@/components/venue/events/NewEventWizard";
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";
import * as events from "@/lib/venue/events";
import * as eventsClient from "@/lib/venue/events-client";
import * as menusLib from "@/lib/venue/menus";
import { formatMkDate } from "@/lib/date";

// The room-layout resolver (event-wizard, 0141) fetches a room's saved
// presets/fixed elements/table types as soon as a full-capacity room is
// selected — mocked empty here so it resolves instantly with "no presets",
// letting a test drive the "+ Нов распоред" → "Готово" → "Продолжи без
// зачувување" path generically via resolveRoomLayoutModalsIfAny below.
vi.mock("@/lib/venue/room-presets", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listRoomPresets: vi.fn().mockResolvedValue([]),
  getRoomPresetSnapshot: vi.fn(),
  saveRoomPresetFromElements: vi.fn(),
}));
vi.mock("@/lib/venue/floorplan", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listFixedElements: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/venue/rooms", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listTableTypes: vi.fn().mockResolvedValue([]),
}));

/** Resolves every room-layout modal the wizard auto-opens (one per
 * full-capacity room picked), always via "create new, empty, don't save" —
 * the specific layout content doesn't matter to these tests. */
async function resolveRoomLayoutModalsIfAny() {
  while (screen.queryByRole("heading", { name: /^Распоред за/ })) {
    await userEvent.click(screen.getByRole("button", { name: /нов распоред/i }));
    await userEvent.click(screen.getByRole("button", { name: "Готово" }));
    await userEvent.click(screen.getByRole("button", { name: /продолжи без зачувување/i }));
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** The date step (0144) dropped the native input for a calendar-only
 * picker — clicks `day` in whatever month it currently shows. No month
 * navigation is needed: nothing requires a future date, only a confirm
 * dialog on submit for a past one (see pickPastDate below). */
async function pickDate(day: number): Promise<string> {
  const now = new Date();
  await userEvent.click(screen.getByRole("button", { name: String(day) }));
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(day)}`;
}

/** Navigates the date-step calendar back one month and picks day 1 — reliably in the past, for the past-date confirmation test. */
async function pickPastDate(): Promise<string> {
  const now = new Date();
  await userEvent.click(screen.getByRole("button", { name: "Претходен месец" }));
  await userEvent.click(screen.getByRole("button", { name: "1" }));
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prevMonth.getFullYear()}-${pad2(prevMonth.getMonth() + 1)}-01`;
}

function renderWizard(props: Partial<React.ComponentProps<typeof NewEventWizard>> & Pick<React.ComponentProps<typeof NewEventWizard>, "rooms" | "menuTemplates" | "onCreated">) {
  return render(
    <ManagerElevationProvider>
      <NewEventWizard venueId="v1" {...props} />
    </ManagerElevationProvider>,
  );
}

let confirmSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(events, "findSameDayRoomEvents").mockResolvedValue([]);
  vi.spyOn(eventsClient, "fetchNewEventCustomMenuEnabled").mockResolvedValue(true);
});

/** From the type grid to the rooms/menu step (step 5). */
async function goToMenuStep() {
  await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
  await userEvent.click(await screen.findByRole("button", { name: /цел простор/i }));
  await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
  await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
  await pickDate(15);
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
}

/** From the menu step through to "Креирај настан", clicked. */
async function finishFromMenuStep() {
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
  await userEvent.click(screen.getByRole("button", { name: /прескокни/i }));
  await userEvent.type(screen.getByLabelText(/корисничко име/i), "-x");
  await userEvent.type(screen.getByLabelText(/^лозинка/i), "a-strong-password");
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
  await userEvent.type(screen.getByLabelText("Email на парот"), "couple@example.com");
  await userEvent.type(screen.getByLabelText("Телефон на парот"), "070 123 456");
  await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));
}

/** Drives the wizard from the type grid through every step, filling the
 * minimum required fields, stopping right before the final submit click.
 * Returns the ISO date actually picked, for callers that need to assert
 * on it. Picks a date reliably in the past when `pastDate` is set (for the
 * past-date confirmation test); otherwise day 15 of whatever month the
 * calendar opens to — no field requires a future date, only a confirm
 * dialog at submit for a past one. */
async function fillThroughToSubmit(opts: {
  type: RegExp;
  name: string;
  pastDate?: boolean;
  username?: string;
  password?: string;
  email?: string;
  phone?: string;
}): Promise<string> {
  await userEvent.click(screen.getByRole("button", { name: opts.type }));
  await userEvent.click(await screen.findByRole("button", { name: /цел простор/i }));
  await waitFor(() => expect(screen.getByLabelText(/имиња на младенците|име на прославата/i)).toBeInTheDocument());

  await userEvent.type(screen.getByLabelText(/имиња на младенците|име на прославата/i), opts.name);
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));

  const date = opts.pastDate ? await pickPastDate() : await pickDate(15);
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));

  // guests step: default 120 is already valid, just continue
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));

  // rooms/menu step: resolve any auto-opened room-layout modal, then continue
  await resolveRoomLayoutModalsIfAny();
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));

  // price step: skip
  await userEvent.click(screen.getByRole("button", { name: /прескокни/i }));

  // The username field is pre-filled by the name's transliterated
  // suggestion, so typing into it must clear that first instead of
  // appending to it.
  if (opts.username) {
    const usernameField = screen.getByLabelText(/корисничко име/i);
    await userEvent.clear(usernameField);
    await userEvent.type(usernameField, opts.username);
  }
  if (opts.password) await userEvent.type(screen.getByLabelText(/^лозинка/i), opts.password);
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));

  if (opts.email) await userEvent.type(screen.getByLabelText("Email на парот"), opts.email);
  if (opts.phone) await userEvent.type(screen.getByLabelText("Телефон на парот"), opts.phone);
  return date;
}

describe("NewEventWizard", () => {
  it("creates a wedding end to end and shows the success screen only after the server confirms", async () => {
    const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockResolvedValue({ id: "e1" });
    const onCreated = vi.fn();
    const room = { id: "r1", venue_id: "v1", name: "Garden", width_cm: 1000, height_cm: 800 };

    renderWizard({ rooms: [room], menuTemplates: [{ id: "m1", venue_id: "v1", name: "Standard Menu", description: null, items: [] }], onCreated });

    const expectedDate = await fillThroughToSubmit({
      type: /свадба/i,
      name: "Ivana & Petar",
      username: "ivana-petar",
      password: "a-strong-password",
      email: "couple@example.com",
      phone: "070 123 456",
    });

    // Success screen must not appear until the API call actually resolves.
    expect(screen.queryByText("НАСТАНОТ Е КРЕИРАН")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy).toHaveBeenCalledWith(
      {
        venue_id: "v1",
        couple_names: "Ivana & Petar",
        event_date: expectedDate,
        start_time: null,
        end_time: null,
        event_type: "wedding",
        seating_mode: "full",
        status: "preparation",
        guest_count_estimate: 120,
        // The venue's only hall, pre-checked for it (room is Garden/"r1" above).
        room_ids: ["r1"],
        // Resolved via the auto-opened layout modal: "+ Нов распоред" → "Готово" → "Продолжи без зачувување", built empty.
        room_layouts: { r1: [] },
        menu_template_ids: [],
        contacts: { contact_email: "couple@example.com", contact_email_2: null, contact_phone: "070 123 456" },
        credentials: { username: "ivana-petar", password: "a-strong-password" },
        total_price: null,
        deposit_paid: null,
      },
      null,
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(await screen.findByText("НАСТАНОТ Е КРЕИРАН")).toBeInTheDocument();
    expect(screen.getByText("Ivana & Petar")).toBeInTheDocument();
    expect(screen.getByText("ivana-petar")).toBeInTheDocument();
    expect(screen.getByText("a-strong-password")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Кон настаните" }));
    expect(onCreated).toHaveBeenCalled();
  });

  it("sends seating_mode: mini when the mini-event card is picked instead (Project A §1)", async () => {
    const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockClear().mockResolvedValue({ id: "e-mini" });
    const room = { id: "r1", venue_id: "v1", name: "Garden", width_cm: 1000, height_cm: 800 };
    renderWizard({ rooms: [room], menuTemplates: [], onCreated: vi.fn() });

    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await userEvent.click(await screen.findByRole("button", { name: /мини настан/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await pickDate(15);
    await userEvent.type(screen.getByLabelText(/почеток/i), "18:00");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    // The venue's only hall is pre-checked (same convenience as any other
    // event), already satisfying the mini-event's exactly-one-room rule.
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /прескокни/i }));
    const usernameField = screen.getByLabelText(/корисничко име/i);
    await userEvent.clear(usernameField);
    await userEvent.type(usernameField, "ana-petar");
    await userEvent.type(screen.getByLabelText(/^лозинка/i), "a-strong-password");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.type(screen.getByLabelText("Email на парот"), "couple@example.com");
    await userEvent.type(screen.getByLabelText("Телефон на парот"), "070 123 456");
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy.mock.calls[0][0]).toMatchObject({ seating_mode: "mini" });
  });

  it("for a mini-event, picking a room swaps the choice instead of adding to it (Project B §2)", async () => {
    const roomA = { id: "r1", venue_id: "v1", name: "Голема", width_cm: 1000, height_cm: 800 };
    const roomB = { id: "r2", venue_id: "v1", name: "Мала", width_cm: 1000, height_cm: 800 };
    renderWizard({ rooms: [roomA, roomB], menuTemplates: [], onCreated: vi.fn() });

    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await userEvent.click(await screen.findByRole("button", { name: /мини настан/i }));
    await userEvent.type(await screen.findByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await pickDate(15);
    const timeInput = screen.getByLabelText(/почеток/i);
    await userEvent.type(timeInput, "18:00");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i })); // guests: default is fine

    await userEvent.click(screen.getByRole("button", { name: "Голема" }));
    expect(screen.getByRole("button", { name: "Голема" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Мала" }));
    expect(screen.getByRole("button", { name: "Мала" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Голема" })).toHaveAttribute("aria-pressed", "false");
  });

  it("blocks moving past the seating-mode step without picking one", async () => {
    renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    expect(await screen.findByRole("heading", { name: "Цел простор или дел од него?" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/имиња на младенците/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /понатаму/i })).not.toBeInTheDocument();
  });

  it("creates a birthday, using the organizers' wording instead of the couple's", async () => {
    const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockResolvedValue({ id: "e2" });
    renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });

    await fillThroughToSubmit({
      type: /роденден/i,
      name: "Првиот роденден на Ива",
      username: "iva-1",
      password: "a-strong-password",
      email: "parent@example.com",
      phone: "070 999 888",
    });
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy.mock.calls[0][0]).toMatchObject({ couple_names: "Првиот роденден на Ива", event_type: "birthday" });
    expect(await screen.findByText(/Податоци за најава на организаторите/)).toBeInTheDocument();
  });

  it("suggests a transliterated username from the typed name, until the username is hand-edited", async () => {
    renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await userEvent.click(await screen.findByRole("button", { name: /цел простор/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ивана & Марко");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await pickDate(15);
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /прескокни/i }));

    expect(screen.getByLabelText(/корисничко име/i)).toHaveValue("ivana-marko");
    await userEvent.type(screen.getByLabelText(/корисничко име/i), "-custom");
    expect(screen.getByLabelText(/корисничко име/i)).toHaveValue("ivana-marko-custom");
  });

  it("blocks moving past step 0 without picking a type", async () => {
    renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });
    expect(screen.queryByLabelText(/имиња на младенците|име на прославата/i)).not.toBeInTheDocument();
    // No "next" button exists on step 0 — picking a type is the only way forward, confirmed by its absence.
    expect(screen.queryByRole("button", { name: /понатаму/i })).not.toBeInTheDocument();
  });

  it("blocks the name step when left empty", async () => {
    renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await userEvent.click(await screen.findByRole("button", { name: /цел простор/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    expect(await screen.findByText("Внесете ги имињата на младенците")).toBeInTheDocument();
    expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument();
  });

  it("rejects a deposit larger than the total price on the price step", async () => {
    renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await userEvent.click(await screen.findByRole("button", { name: /цел простор/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await pickDate(15);
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));

    await userEvent.type(screen.getByLabelText(/вкупна цена/i), "100");
    await userEvent.type(screen.getByLabelText(/платен капар/i), "150");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    expect(await screen.findByText("Капарот не може да биде поголем од вкупната цена.")).toBeInTheDocument();
  });

  it("does not create an event without the couple's email and phone (A21)", async () => {
    const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockClear().mockResolvedValue({ id: "e1" });
    renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });
    await fillThroughToSubmit({
      type: /свадба/i,
      name: "Ana & Petar",
      username: "ana-petar",
      password: "a-strong-password",
      email: "couple@example.com",
      // phone intentionally left out
    });
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));
    expect(await screen.findByText("Внесете телефон на парот.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("does not create an event on a past date when the question is declined", async () => {
    const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockClear().mockResolvedValue({ id: "e1" });
    confirmSpy.mockReturnValue(false);
    renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });
    const pastDate = await fillThroughToSubmit({
      type: /свадба/i,
      name: "Ана и Марко",
      pastDate: true,
      username: "ana-marko",
      password: "a-strong-password",
      email: "couple@example.com",
      phone: "070 123 456",
    });
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));
    expect(confirmSpy).toHaveBeenCalledWith(`Датумот ${formatMkDate(pastDate)} е во минатото. Да се креира настанот сепак?`);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("pre-checks a venue's only hall, same as the previous single-page form did", async () => {
    const room = { id: "r1", venue_id: "v1", name: "Garden", width_cm: 1000, height_cm: 800 };
    renderWizard({ rooms: [room], menuTemplates: [], onCreated: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await userEvent.click(await screen.findByRole("button", { name: /цел простор/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await pickDate(15);
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    expect(screen.getByRole("button", { name: "Garden" })).toHaveAttribute("aria-pressed", "true");
  });

  it("can select two menus at once (e.g. classic + посно for mixed diets), sending menu_template_ids only", async () => {
    const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockResolvedValue({ id: "e3" });
    const classic = { id: "m1", venue_id: "v1", name: "Класично мени", description: null, items: [{ id: "i1", venue_id: "v1", tiers: ["special" as const], course: "main" as const, name: "Телешко", allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null }] };
    const posno = { id: "m2", venue_id: "v1", name: "Посно мени", description: null, items: [] };
    renderWizard({ rooms: [], menuTemplates: [classic, posno], onCreated: vi.fn() });

    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await userEvent.click(await screen.findByRole("button", { name: /цел простор/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await pickDate(15);
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));

    // Both menus can be on at once — selecting one doesn't clear the other.
    await userEvent.click(screen.getByRole("button", { name: "Класично мени" }));
    await userEvent.click(screen.getByRole("button", { name: "Посно мени" }));
    expect(screen.getByRole("button", { name: "Класично мени" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Посно мени" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /прескокни/i }));
    await userEvent.type(screen.getByLabelText(/корисничко име/i), "-x");
    await userEvent.type(screen.getByLabelText(/^лозинка/i), "a-strong-password");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.type(screen.getByLabelText("Email на парот"), "couple@example.com");
    await userEvent.type(screen.getByLabelText("Телефон на парот"), "070 123 456");
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy.mock.calls[0][0]).toMatchObject({ menu_template_ids: ["m1", "m2"] });
    // wizard sends menu_template_ids only — no legacy scalar.
    expect(createSpy.mock.calls[0][0]).not.toHaveProperty("menu_template_id");
  });

  it("opens a menu's own detail view to show its dishes, independently for each menu", async () => {
    const classic = {
      id: "m1", venue_id: "v1", name: "Класично мени", description: null,
      items: [{ id: "i1", venue_id: "v1", tiers: ["special" as const], course: "main" as const, name: "Телешко печено", allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null }],
    };
    const posno = {
      id: "m2", venue_id: "v1", name: "Посно мени", description: null,
      items: [{ id: "i2", venue_id: "v1", tiers: ["special" as const], course: "main" as const, name: "Полнети пиперки", allergen_tags: [], is_vegetarian: true, is_vegan: true, price: null, photo_path: null }],
    };
    renderWizard({ rooms: [], menuTemplates: [classic, posno], onCreated: vi.fn() });

    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await userEvent.click(await screen.findByRole("button", { name: /цел простор/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await pickDate(15);
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));

    await userEvent.click(screen.getByRole("button", { name: "Погледни што содржи Класично мени" }));
    expect(await screen.findByText("Телешко печено")).toBeInTheDocument();
    expect(screen.queryByText("Полнети пиперки")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /затвори/i }));
    expect(screen.queryByText("Телешко печено")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Погледни што содржи Посно мени" }));
    expect(await screen.findByText("Полнети пиперки")).toBeInTheDocument();
  });

  describe("custom menu", () => {
    const dish = { id: "d1", venue_id: "v1", tiers: [], course: "main" as const, name: "Печено", allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null };
    const classic = { id: "m1", venue_id: "v1", name: "Класично мени", description: null, items: [] };

    it("builds a custom menu in the same panel as a package and sends it with the event, next to the packages", async () => {
      const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockClear().mockResolvedValue({ id: "e5" });
      vi.spyOn(menusLib, "listMenuItems").mockResolvedValue([dish]);
      renderWizard({ rooms: [], menuTemplates: [classic], onCreated: vi.fn() });
      await goToMenuStep();

      await userEvent.click(screen.getByRole("button", { name: "Класично мени" }));
      await userEvent.click(screen.getByRole("button", { name: /^сопствено мени/i }));
      await userEvent.click(await screen.findByTestId("pkg-toggle-d1"));
      const nameField = screen.getByRole("textbox", { name: "Име на пакетот" });
      await userEvent.clear(nameField);
      await userEvent.type(nameField, "Мени на Ана");
      await userEvent.click(screen.getByRole("button", { name: "Зачувај мени" }));

      // Selected next to the package; the preview lists both.
      expect(await screen.findByText("Сопствено мени · 1 јадења")).toBeInTheDocument();
      expect(screen.getByText("Класично мени, Мени на Ана")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Без мени" })).toHaveAttribute("aria-pressed", "false");

      await finishFromMenuStep();
      await waitFor(() => expect(createSpy).toHaveBeenCalled());
      expect(createSpy.mock.calls[0][0]).toMatchObject({
        menu_template_ids: ["m1"],
        custom_menu: { name: "Мени на Ана", item_ids: ["d1"] },
      });
    });

    it("refuses to keep a custom menu with no dishes", async () => {
      vi.spyOn(menusLib, "listMenuItems").mockResolvedValue([dish]);
      renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });
      await goToMenuStep();
      await userEvent.click(screen.getByRole("button", { name: /^сопствено мени/i }));
      await userEvent.click(await screen.findByRole("button", { name: "Зачувај мени" }));
      expect(await screen.findByText("Изберете барем едно јадење.")).toBeInTheDocument();
    });

    it("removing it (or Без мени) sends no custom menu", async () => {
      const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockClear().mockResolvedValue({ id: "e6" });
      vi.spyOn(menusLib, "listMenuItems").mockResolvedValue([dish]);
      renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });
      await goToMenuStep();
      await userEvent.click(screen.getByRole("button", { name: /^сопствено мени/i }));
      await userEvent.click(await screen.findByTestId("pkg-toggle-d1"));
      await userEvent.click(screen.getByRole("button", { name: "Зачувај мени" }));
      await userEvent.click(await screen.findByRole("button", { name: "Отстрани го Сопствено мени" }));
      expect(screen.getByRole("button", { name: "Без мени" })).toHaveAttribute("aria-pressed", "true");

      await finishFromMenuStep();
      await waitFor(() => expect(createSpy).toHaveBeenCalled());
      expect(createSpy.mock.calls[0][0]).not.toHaveProperty("custom_menu");
    });

    it("shows the locked hint instead of the option when the plan has no custom menu", async () => {
      vi.spyOn(eventsClient, "fetchNewEventCustomMenuEnabled").mockResolvedValue(false);
      renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });
      await goToMenuStep();
      expect(await screen.findByText(/не е вклучена во вашиот пакет/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^сопствено мени/i })).not.toBeInTheDocument();
    });
  });

  it("resolves a room's layout by picking a saved preset, sending its snapshot as room_layouts", async () => {
    const presetsLib = await import("@/lib/venue/room-presets");
    vi.mocked(presetsLib.listRoomPresets).mockResolvedValue([
      { id: "p1", room_id: "r1", name: "Стандарден", created_at: "2027-01-01", updated_at: "2027-01-01" },
    ]);
    const presetElements = [
      { element_type: "table" as const, table_type_id: null, x_cm: 10, y_cm: 10, width_cm: 160, length_cm: 160, rotation_deg: 0, label: "Маса 1", group_id: null, table_role: "guest" as const },
    ];
    vi.mocked(presetsLib.getRoomPresetSnapshot).mockResolvedValue({ fixed: [], elements: presetElements });
    const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockClear().mockResolvedValue({ id: "e-preset" });
    const room = { id: "r1", venue_id: "v1", name: "Garden", width_cm: 1000, height_cm: 800 };
    renderWizard({ rooms: [room], menuTemplates: [], onCreated: vi.fn() });

    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await userEvent.click(await screen.findByRole("button", { name: /цел простор/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await pickDate(15);
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i })); // guests -> rooms/menu

    // The room-layout modal auto-opens for the single pre-checked hall; preview its saved preset, then confirm.
    expect(await screen.findByRole("heading", { name: "Распоред за Garden" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Стандарден" }));
    await userEvent.click(await screen.findByRole("button", { name: "Користи го овој распоред" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /^Распоред за/ })).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /прескокни/i }));
    await userEvent.type(screen.getByLabelText(/корисничко име/i), "-x");
    await userEvent.type(screen.getByLabelText(/^лозинка/i), "a-strong-password");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.type(screen.getByLabelText("Email на парот"), "couple@example.com");
    await userEvent.type(screen.getByLabelText("Телефон на парот"), "070 123 456");
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy.mock.calls[0][0]).toMatchObject({ room_layouts: { r1: presetElements } });
  });

  it("blocks continuing past the rooms step until every selected room's layout is resolved", async () => {
    const room = { id: "r1", venue_id: "v1", name: "Garden", width_cm: 1000, height_cm: 800 };
    renderWizard({ rooms: [room], menuTemplates: [], onCreated: vi.fn() });

    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await userEvent.click(await screen.findByRole("button", { name: /цел простор/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await pickDate(15);
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i })); // guests -> rooms/menu

    // The room-layout modal auto-opens for the single pre-checked hall; close it without resolving.
    expect(await screen.findByRole("heading", { name: /^Распоред за/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Затвори" }));
    expect(screen.queryByRole("heading", { name: /^Распоред за/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    expect(await screen.findByText("Изберете или создајте распоред за секоја избрана сала")).toBeInTheDocument();
    // Still on the rooms/menu step: its "Избери распоред" button is there to retry.
    expect(screen.getByRole("button", { name: "Избери распоред" })).toBeInTheDocument();
  });

  it("warns about another event in the same hall that day, and respects a decline", async () => {
    const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockClear().mockResolvedValue({ id: "e1" });
    vi.spyOn(events, "findSameDayRoomEvents").mockResolvedValue([
      { id: "other", couple_names: "Existing Party", start_time: "18:00", end_time: "22:00" } as Awaited<ReturnType<typeof events.findSameDayRoomEvents>>[number],
    ]);
    const room = { id: "r1", venue_id: "v1", name: "Garden", width_cm: 1000, height_cm: 800 };
    confirmSpy.mockReturnValue(false);
    renderWizard({ rooms: [room], menuTemplates: [], onCreated: vi.fn() });

    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await userEvent.click(await screen.findByRole("button", { name: /цел простор/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Марко");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await pickDate(15);
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: "Garden" }));
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.click(screen.getByRole("button", { name: /прескокни/i }));
    const usernameField = screen.getByLabelText(/корисничко име/i);
    await userEvent.clear(usernameField);
    await userEvent.type(usernameField, "ana-marko");
    await userEvent.type(screen.getByLabelText(/^лозинка/i), "a-strong-password");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.type(screen.getByLabelText("Email на парот"), "couple@example.com");
    await userEvent.type(screen.getByLabelText("Телефон на парот"), "070 123 456");
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Existing Party")));
    expect(createSpy).not.toHaveBeenCalled();
  });
});
