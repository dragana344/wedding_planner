import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewEventWizard } from "@/components/venue/events/NewEventWizard";
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";
import * as events from "@/lib/venue/events";
import * as eventsClient from "@/lib/venue/events-client";
import * as menusLib from "@/lib/venue/menus";

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
  await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
  await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
  await userEvent.type(screen.getByLabelText(/^датум/i), "2027-10-01");
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

/** Drives the wizard from the type grid through every step, filling the minimum required fields, stopping right before the final submit click. */
async function fillThroughToSubmit(opts: {
  type: RegExp;
  name: string;
  date: string;
  username?: string;
  password?: string;
  email?: string;
  phone?: string;
}) {
  await userEvent.click(screen.getByRole("button", { name: opts.type }));
  await waitFor(() => expect(screen.getByLabelText(/имиња на младенците|име на прославата/i)).toBeInTheDocument());

  await userEvent.type(screen.getByLabelText(/имиња на младенците|име на прославата/i), opts.name);
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));

  await userEvent.type(screen.getByLabelText(/^датум/i), opts.date);
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));

  // guests step: default 120 is already valid, just continue
  await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));

  // rooms/menu step: nothing required, continue
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
}

describe("NewEventWizard", () => {
  it("creates a wedding end to end and shows the success screen only after the server confirms", async () => {
    const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockResolvedValue({ id: "e1" });
    const onCreated = vi.fn();
    const room = { id: "r1", venue_id: "v1", name: "Garden", width_cm: 1000, height_cm: 800 };

    renderWizard({ rooms: [room], menuTemplates: [{ id: "m1", venue_id: "v1", name: "Standard Menu", description: null, items: [] }], onCreated });

    await fillThroughToSubmit({
      type: /свадба/i,
      name: "Ivana & Petar",
      date: "2027-10-01",
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
        event_date: "2027-10-01",
        start_time: null,
        end_time: null,
        event_type: "wedding",
        status: "preparation",
        guest_count_estimate: 120,
        // The venue's only hall, pre-checked for it (room is Garden/"r1" above).
        room_ids: ["r1"],
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

  it("creates a birthday, using the organizers' wording instead of the couple's", async () => {
    const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockResolvedValue({ id: "e2" });
    renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });

    await fillThroughToSubmit({
      type: /роденден/i,
      name: "Првиот роденден на Ива",
      date: "2027-11-05",
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
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ивана & Марко");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.type(screen.getByLabelText(/^датум/i), "2027-10-01");
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
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    expect(await screen.findByText("Внесете ги имињата на младенците")).toBeInTheDocument();
    expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument();
  });

  it("rejects a deposit larger than the total price on the price step", async () => {
    renderWizard({ rooms: [], menuTemplates: [], onCreated: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.type(screen.getByLabelText(/^датум/i), "2027-10-01");
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
      date: "2027-10-01",
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
    await fillThroughToSubmit({
      type: /свадба/i,
      name: "Ана и Марко",
      date: "2000-02-20",
      username: "ana-marko",
      password: "a-strong-password",
      email: "couple@example.com",
      phone: "070 123 456",
    });
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));
    expect(confirmSpy).toHaveBeenCalledWith("Датумот 20 февруари 2000 е во минатото. Да се креира настанот сепак?");
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("pre-checks a venue's only hall, same as the previous single-page form did", async () => {
    const room = { id: "r1", venue_id: "v1", name: "Garden", width_cm: 1000, height_cm: 800 };
    renderWizard({ rooms: [room], menuTemplates: [], onCreated: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.type(screen.getByLabelText(/^датум/i), "2027-10-01");
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
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.type(screen.getByLabelText(/^датум/i), "2027-10-01");
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
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Петар");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.type(screen.getByLabelText(/^датум/i), "2027-10-01");
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

  it("warns about another event in the same hall that day, and respects a decline", async () => {
    const createSpy = vi.spyOn(eventsClient, "createEventViaApi").mockClear().mockResolvedValue({ id: "e1" });
    vi.spyOn(events, "findSameDayRoomEvents").mockResolvedValue([
      { id: "other", couple_names: "Existing Party", start_time: "18:00", end_time: "22:00" } as Awaited<ReturnType<typeof events.findSameDayRoomEvents>>[number],
    ]);
    const room = { id: "r1", venue_id: "v1", name: "Garden", width_cm: 1000, height_cm: 800 };
    confirmSpy.mockReturnValue(false);
    renderWizard({ rooms: [room], menuTemplates: [], onCreated: vi.fn() });

    await userEvent.click(screen.getByRole("button", { name: /свадба/i }));
    await waitFor(() => expect(screen.getByLabelText(/имиња на младенците/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/имиња на младенците/i), "Ана и Марко");
    await userEvent.click(screen.getByRole("button", { name: /понатаму/i }));
    await userEvent.type(screen.getByLabelText(/^датум/i), "2027-10-01");
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
