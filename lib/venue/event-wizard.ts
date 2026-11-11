import type { EventType, EventStatus } from "./events";
import { depositExceedsTotal, DEPOSIT_OVER_TOTAL_ERROR } from "./events";
import { parseCoupleContacts } from "./event-contacts";
import { transliterateToSlug } from "./transliterate";
import type { SnapshotElement } from "./room-presets";

export const WIZARD_STEP_COUNT = 10;

export type SeatingMode = "full" | "mini";

export interface WizardState {
  type: EventType | null;
  /** The venue's own name for a "Друго" event, e.g. "Прослава за 20 години брак" (optional). */
  typeLabel: string;
  /** Project A §1: chosen explicitly, before anything else about the event. */
  seatingMode: SeatingMode | null;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  guestCount: number;
  roomIds: string[];
  /** Project A/event-wizard: each selected full-capacity room's resolved
   * starting layout (a saved preset's elements, or ones built from scratch
   * in the wizard), keyed by room_id. A room without an entry here isn't
   * resolved yet — validateStep's room step blocks on that. Unused in mini mode. */
  roomLayouts: Record<string, SnapshotElement[]>;
  menuTemplateIds: string[];
  /** The event's own menu, built here and created together with the event. */
  customMenu: { name: string; itemIds: string[] } | null;
  totalPrice: string;
  depositPaid: string;
  username: string;
  /** Once the venue edits the username by hand, typing in the name field stops overwriting it. */
  usernameTouched: boolean;
  password: string;
  contactEmail: string;
  contactEmail2: string;
  contactPhone: string;
  status: EventStatus;
}

export function initialWizardState(presetRoomIds: string[] = []): WizardState {
  return {
    type: null,
    typeLabel: "",
    seatingMode: null,
    name: "",
    date: "",
    startTime: "",
    endTime: "",
    guestCount: 120,
    roomIds: presetRoomIds,
    roomLayouts: {},
    menuTemplateIds: [],
    customMenu: null,
    totalPrice: "",
    depositPaid: "",
    username: "",
    usernameTouched: false,
    password: "",
    contactEmail: "",
    contactEmail2: "",
    contactPhone: "",
    status: "preparation",
  };
}

/** The name field drives the username suggestion until the venue types into the username field itself. */
export function nameChanged(state: WizardState, name: string): Pick<WizardState, "name" | "username"> {
  return { name, username: state.usernameTouched ? state.username : transliterateToSlug(name) };
}

/**
 * The error to show under a given step, or null when it's satisfied — the
 * same required fields the previous single-page form enforced (type, name,
 * date, deposit ≤ total, username + a ≥10-char password, a working email and
 * phone for the couple), just surfaced one step at a time instead of all at
 * once.
 */
export function validateStep(step: number, state: WizardState): string | null {
  switch (step) {
    case 0:
      return state.type ? null : "Изберете тип на настан";
    case 1:
      return state.seatingMode ? null : "Изберете начин на седење";
    case 2:
      if (state.name.trim()) return null;
      return state.type === "wedding" ? "Внесете ги имињата на младенците" : "Внесете име на прославата";
    case 3:
      if (!state.date) return "Изберете датум";
      // Project B §2: a mini-event's table claim is a reservation, which
      // needs a concrete start time — a full event can still leave it for later.
      if (state.seatingMode === "mini" && !state.startTime) return "Изберете почетно време";
      return null;
    case 5:
      // Project B §2: a mini-event claims exactly one room; a full event may skip this step.
      if (state.seatingMode === "mini" && state.roomIds.length !== 1) return "Изберете една сала";
      // Every full-capacity room needs its starting layout resolved (picked or built) before moving on.
      if (state.seatingMode === "full" && state.roomIds.some((id) => !state.roomLayouts[id])) {
        return "Изберете или создајте распоред за секоја избрана сала";
      }
      return null;
    // case 6 (menu) has no required fields — a staff member may decide the menu later.
    case 7:
      return depositExceedsTotal(state.totalPrice, state.depositPaid) ? DEPOSIT_OVER_TOTAL_ERROR : null;
    case 8:
      if (!state.username.trim()) return "Внесете корисничко име";
      if (state.password.length < 10) return "Лозинката треба да има најмалку 10 знаци";
      return null;
    case 9: {
      const result = parseCoupleContacts({
        contact_email: state.contactEmail,
        contact_phone: state.contactPhone,
        contact_email_2: state.contactEmail2,
      });
      return result.ok ? null : result.error;
    }
    default:
      return null;
  }
}

/** Who the couple-login credentials are actually for — a wedding's couple, or whoever organized anything else. */
export function wizardWho(type: EventType | null): string {
  return type === "wedding" ? "младенците" : "организаторите";
}

/** [title, subtitle] for each of the 10 steps, worded around the event type where it reads better. */
export function wizardStepTitles(type: EventType | null): [string, string][] {
  const who = wizardWho(type);
  const isWedding = type === "wedding";
  return [
    ["Каков настан славиме?", "Изберете го типот на прославата"],
    ["Цел простор или дел од него?", "Ова одлучува како ќе работи седењето за овој настан"],
    [isWedding ? "Кои се младенците?" : "Како се вика прославата?", "Ова име ќе стои на врвот на нивната страница"],
    ["Кога е големиот ден?", "Датум и време на почеток и крај"],
    ["Колку гости очекувате?", "Отприлика е доволно, бројот може да се смени подоцна"],
    ["Каде ќе биде настанот?", "Изберете простории и распоред на маси"],
    ["Што ќе се служи?", "Изберете мени за гостите"],
    ["Колку чини настанот?", "Опционално, за да го следите плаќањето"],
    [`Пристап за ${who}`, `Со овие податоци ${who} се најавуваат и го планираат настанот`],
    ["Како да ги контактираме?", `Контакт на ${who}`],
  ];
}
