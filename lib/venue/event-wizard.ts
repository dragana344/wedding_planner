import type { EventType, EventStatus } from "./events";
import { depositExceedsTotal, DEPOSIT_OVER_TOTAL_ERROR } from "./events";
import { parseCoupleContacts } from "./event-contacts";
import { transliterateToSlug } from "./transliterate";

export const WIZARD_STEP_COUNT = 8;

export interface WizardState {
  type: EventType | null;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  guestCount: number;
  roomIds: string[];
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
    name: "",
    date: "",
    startTime: "",
    endTime: "",
    guestCount: 120,
    roomIds: presetRoomIds,
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
      if (state.name.trim()) return null;
      return state.type === "wedding" ? "Внесете ги имињата на младенците" : "Внесете име на прославата";
    case 2:
      return state.date ? null : "Изберете датум";
    case 5:
      return depositExceedsTotal(state.totalPrice, state.depositPaid) ? DEPOSIT_OVER_TOTAL_ERROR : null;
    case 6:
      if (!state.username.trim()) return "Внесете корисничко име";
      if (state.password.length < 10) return "Лозинката треба да има најмалку 10 знаци";
      return null;
    case 7: {
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

/** [title, subtitle] for each of the 8 steps, worded around the event type where it reads better. */
export function wizardStepTitles(type: EventType | null): [string, string][] {
  const who = wizardWho(type);
  const isWedding = type === "wedding";
  return [
    ["Каков настан славиме?", "Изберете го типот на прославата"],
    [isWedding ? "Кои се младенците?" : "Како се вика прославата?", "Ова име ќе стои на врвот на нивната страница"],
    ["Кога е големиот ден?", "Датум и време на почеток и крај"],
    ["Колку гости очекувате?", "Отприлика е доволно, бројот може да се смени подоцна"],
    ["Каде и што ќе се служи?", "Изберете простории и мени"],
    ["Колку чини настанот?", "Опционално, за да го следите плаќањето"],
    [`Пристап за ${who}`, `Со овие податоци ${who} се најавуваат и го планираат настанот`],
    ["Како да ги контактираме?", `Контакт на ${who}`],
  ];
}
