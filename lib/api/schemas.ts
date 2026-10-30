// lib/api/schemas.ts
//
// Request schemas for every API route (SEC-004). Each route declares the
// shape of its JSON body / dynamic params here, and the handler wrapper
// (lib/api/handler.ts) rejects anything else with a 400 *before* any
// database call is made.
//
// Conventions:
// - `z.object` strips unknown keys, so only whitelisted fields ever reach a
//   lib function (and from there an insert/update).
// - Optional text fields accept `string | null | undefined` exactly as the
//   routes did before; routes keep their own `|| null` / `?? default`
//   normalisation so valid input produces the same writes as before.
// - Issues use the route's default invalid-input message unless a schema
//   attaches its own (`{ error: "..." }`), which lets a route keep a message
//   it already returned for that field before validation existed.
// - Caps are generous: they bound abuse, not normal use. Names/titles/labels
//   200 chars, free-text notes/messages 5000, the notes page body 50 000,
//   party size 1..50, quantities 1..100 000, money 0..1e12.

import { z } from "zod";
import { DEPOSIT_OVER_TOTAL_ERROR } from "@/lib/venue/events";

// ---------------------------------------------------------------------------
// Messages

/** Default 400 message for a couple route whose body fails validation. */
export const INVALID_INPUT_ERROR = "Неважечки податоци.";
/** Default 400 message for a couple route whose `[id]` param is not a UUID. */
export const INVALID_ID_ERROR = "Неважечки идентификатор.";
export const INVALID_JSON_ERROR = "Неважечко JSON тело";
export const ROOM_ID_REQUIRED_ERROR = "room_id е задолжителен.";

// ---------------------------------------------------------------------------
// Primitives

export const NAME_MAX = 200;
export const TEXT_MAX = 5000;
export const NOTE_CONTENT_MAX = 50_000;
export const PARTY_SIZE_MAX = 50;
export const QUANTITY_MAX = 100_000;
export const MONEY_MAX = 1_000_000_000_000;
export const ID_LIST_MAX = 500;
/** Seating coordinates/sizes are in centimetres; 1 km is far beyond any room. */
const CM_MAX = 100_000;

/** Any 8-4-4-4-12 hex UUID (Postgres' `uuid` input format, any version). */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Throws unless every value is a UUID. Used by lib code that interpolates
 * ids into a PostgREST filter string, as a second line of defence behind the
 * route schemas.
 */
export function assertUuids(values: readonly unknown[], message = "Invalid id."): asserts values is string[] {
  for (const value of values) {
    if (!isUuid(value)) throw new Error(message);
  }
}

export const uuid = z.string().regex(UUID_RE);

/**
 * Public invitation slugs are base64url of 9 random bytes (12 chars); the
 * format is checked loosely so a slug-shaped value is the only thing that
 * reaches the lookup.
 */
export const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;

const name = z.string().max(NAME_MAX);
/** Optional free-text field: the routes map `""`/`null`/missing to `null`. */
const optionalText = (max: number) => z.string().max(max).nullable().optional();
/** A finite number (JSON cannot carry NaN/Infinity, but be explicit). */
const finite = z.number().finite();
const cm = finite.min(-CM_MAX).max(CM_MAX);
const positiveCm = finite.positive().max(CM_MAX);
const money = finite.min(0).max(MONEY_MAX);
/** `<input type="time">` value ("HH:MM", optionally with seconds) or "". */
const timeOfDay = z.string().regex(/^(?:(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?)?$/);
/** `<input type="date">` value ("YYYY-MM-DD") or "". */
const dateOnly = z.string().regex(/^(?:\d{4}-\d{2}-\d{2})?$/);

/**
 * Marks the "full edit" branch of a PATCH union: it must not carry a `type`,
 * so a typed body with bad fields (e.g. `{ type: "status", rsvp_status: "x",
 * full_name: "..." }`) is rejected instead of falling through to a full edit.
 */
const noType = { type: z.undefined().optional() };

// ---------------------------------------------------------------------------
// Params

export const idParams = z.object({ id: uuid });
export const subtaskParams = z.object({ id: uuid, subtaskId: uuid });
export const slugParams = z.object({ slug: z.string().regex(SLUG_RE) });

/** `?room_id=` for the seating GET/DELETE routes. */
export const roomIdQuery = z
  .string({ error: ROOM_ID_REQUIRED_ERROR })
  .min(1, { error: ROOM_ID_REQUIRED_ERROR })
  .regex(UUID_RE, { error: INVALID_ID_ERROR });

// ---------------------------------------------------------------------------
// Couple: agenda

const agendaFields = z.object({
  ...noType,
  time: timeOfDay.nullable().optional(),
  title: name,
  notes: optionalText(TEXT_MAX),
});
export const agendaCreateBody = agendaFields;
export const agendaUpdateBody = z.union([
  z.object({ type: z.literal("move"), direction: z.enum(["up", "down"]) }),
  agendaFields,
]);

// ---------------------------------------------------------------------------
// Couple: budget

export const BUDGET_CATEGORY_IDS = [
  "catering",
  "photography",
  "videography",
  "flowers_decor",
  "music_entertainment",
  "attire",
  "invitations_stationery",
  "transportation",
  "other",
] as const;

export const budgetItemBody = z.object({
  category: z.enum(BUDGET_CATEGORY_IDS),
  custom_label: optionalText(NAME_MAX),
  name,
  estimated_amount: money.nullable().optional(),
  paid_amount: money.nullable().optional(),
});

// ---------------------------------------------------------------------------
// Couple: checklist

const checklistFields = z.object({
  ...noType,
  title: name,
  due_date: dateOnly.nullable().optional(),
});
export const checklistCreateBody = checklistFields;
export const checklistUpdateBody = z.union([
  z.object({ type: z.literal("toggle"), is_done: z.boolean() }),
  checklistFields,
]);
export const subtaskCreateBody = z.object({ title: name });
export const subtaskUpdateBody = z.object({ is_done: z.boolean() });

// ---------------------------------------------------------------------------
// Couple: event contact info and guest-count estimate

export const contactInfoBody = z.object(
  {
    contact_email: optionalText(254),
    contact_email_2: optionalText(254),
    contact_phone: optionalText(50),
  },
  { error: INVALID_JSON_ERROR },
);

export const GUEST_COUNT_ERROR = "Бројот на гости мора да биде не-негативен број.";
export const guestCountBody = z.object(
  {
    guest_count_estimate: z
      .number({ error: GUEST_COUNT_ERROR })
      .int({ error: GUEST_COUNT_ERROR })
      .min(0, { error: GUEST_COUNT_ERROR })
      .max(QUANTITY_MAX, { error: GUEST_COUNT_ERROR })
      .nullable(),
  },
  { error: INVALID_JSON_ERROR },
);

// ---------------------------------------------------------------------------
// Couple: guests

export const RSVP_STATUSES = ["invited", "confirmed", "declined", "pending", "later"] as const;
export const GUEST_SIDES = ["bride", "groom"] as const;

const partySize = z.number().int().min(1).max(PARTY_SIZE_MAX);

const guestFields = z.object({
  ...noType,
  full_name: name,
  phone: optionalText(50),
  // Typed by the couple for guests without the app, e.g. grandparents (A6).
  email: optionalText(254),
  party_size: partySize.nullable().optional(),
  notes: optionalText(TEXT_MAX),
  // "" is tolerated (the route maps it to null) as it was before.
  side: z.union([z.enum(GUEST_SIDES), z.literal("")]).nullable().optional(),
});
export const guestCreateBody = guestFields;
export const guestUpdateBody = z.union([
  z.object({ type: z.literal("status"), rsvp_status: z.enum(RSVP_STATUSES) }),
  z.object({ type: z.literal("side"), side: z.enum(GUEST_SIDES).nullable() }),
  z.object({ type: z.literal("menus"), counts: z.record(uuid, z.number().int().min(1).max(PARTY_SIZE_MAX)) }),
  guestFields,
]);

export const INVITATION_CHANNELS = ["whatsapp", "viber", "sms", "email", "link"] as const;

/** A9: guests the couple just sent the invitation to, and how. */
export const guestsSentBody = z.object({
  guest_ids: z.array(uuid).min(1).max(1000),
  channel: z.enum(INVITATION_CHANNELS),
});

/** A9: guests to email their invitation (one request stays well inside the function timeout). */
export const guestsEmailBody = z.object({ guest_ids: z.array(uuid).min(1).max(200) });

/** A12: a co-organizer login. Usernames: letters, digits, dot, dash, underscore. */
const coPassword = z
  .string()
  .min(10, { error: "Лозинката мора да има најмалку 10 знаци." })
  .max(200, { error: "Лозинката е предолга." });
export const coOrganizerCreateBody = z.object({
  side: z.enum(GUEST_SIDES),
  username: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N}._-]{3,60}$/u, { error: "Корисничкото име: 3–60 букви, бројки, точка, цртичка." }),
  password: coPassword,
});
export const coOrganizerPasswordBody = z.object({ password: coPassword });

/** A10: when the guests' reminder goes out (ISO time), or switched off. */
export const reminderBody = z.object({
  send_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { error: "Неважечко време за потсетникот." }),
  enabled: z.boolean(),
});

/** A CSV the couple uploads (A20); ~1 MB is thousands of guests. */
export const guestImportBody = z.object({ csv: z.string().max(1_000_000, { error: "Датотеката е преголема." }) });

// ---------------------------------------------------------------------------
// Couple: invitation

/** Matches the invitation editor's `maxLength` on the message textarea. */
export const INVITATION_MESSAGE_MAX = 300;

export const invitationBody = z.object({
  // Not restricted to INVITATION_TEMPLATE_IDS: an unknown id has always been
  // accepted and rendered with the default template (getInvitationTemplate),
  // so only its shape and length are bounded.
  template_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  message: optionalText(INVITATION_MESSAGE_MAX),
});

// ---------------------------------------------------------------------------
// Couple: locations

export const locationBody = z.object({
  label: name,
  address: optionalText(500),
  // SEC-025 SR-11: only web links (or empty), never javascript:/data: URLs.
  map_url: z
    .string()
    .max(2000)
    .refine((v) => v.trim() === "" || /^https?:\/\//i.test(v.trim()), "Линкот мора да почнува со http:// или https://.")
    .nullable()
    .optional(),
});

// ---------------------------------------------------------------------------
// Couple: notes

export const noteBody = z.object({
  title: optionalText(NAME_MAX),
  content: z.string().max(NOTE_CONTENT_MAX).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Couple: seating

export const LAYOUT_ELEMENT_TYPES = ["table", "stage", "dance_floor", "bar_movable", "music", "photo_stage", "other"] as const;
export const TABLE_ROLES = ["guest", "couple", "head"] as const;

/**
 * The only fields a new layout element may carry. `event_id` (sent by the
 * shared seating component) is dropped here and re-set from the session.
 */
export const seatingElementCreateBody = z.object({
  room_id: uuid,
  element_type: z.enum(LAYOUT_ELEMENT_TYPES),
  table_type_id: uuid.nullable().optional(),
  x_cm: cm,
  y_cm: cm,
  width_cm: positiveCm,
  length_cm: positiveCm,
  label: optionalText(NAME_MAX),
  table_role: z.enum(TABLE_ROLES).optional(),
});

export const SEATING_UPDATE_TYPE_ERROR = "Непознат тип на ажурирање.";
export const seatingElementUpdateBody = z.discriminatedUnion(
  "type",
  [
    z.object({ type: z.literal("position"), x_cm: cm, y_cm: cm }),
    z.object({ type: z.literal("size"), width_cm: positiveCm, length_cm: positiveCm }),
    z.object({ type: z.literal("rotation"), rotation_deg: finite.min(-3600).max(3600) }),
    z.object({ type: z.literal("label"), label: optionalText(NAME_MAX) }),
  ],
  { error: SEATING_UPDATE_TYPE_ERROR },
);

export const roomIdBody = z.object({ room_id: uuid });

export const seatingGroupBody = z.object({ room_id: uuid, element_ids: z.array(uuid).min(2).max(ID_LIST_MAX) });
export const groupDeleteQuery = z.object({ room_id: uuid, group_id: uuid });

export const SEAT_DUPLICATE_ERROR = "Две лица не можат да седат на исто столче.";
export const SEATS_MAX = 1000;
const seatRow = z.object({
  seat_number: z.number().int().min(1).max(SEATS_MAX),
  guest_id: uuid.nullable().optional(),
  guest_name: z.string().max(NAME_MAX).nullable().optional(),
});
export const seatsPutBody = z
  .object({
    room_id: uuid,
    layout_element_id: uuid,
    seats: z.array(seatRow).max(SEATS_MAX),
    /** The table's list as the client loaded it; a different list on the server → 409. */
    expected: z.array(seatRow).max(SEATS_MAX).optional(),
  })
  .refine((b) => new Set(b.seats.map((s) => s.seat_number)).size === b.seats.length, { error: SEAT_DUPLICATE_ERROR });

// ---------------------------------------------------------------------------
// Couple: login

export const LOGIN_REQUIRED_ERROR = "Задолжителни се корисничкото име и лозинката.";
export const loginBody = z.object(
  {
    username: z.string({ error: LOGIN_REQUIRED_ERROR }).min(1, { error: LOGIN_REQUIRED_ERROR }).max(NAME_MAX),
    password: z.string({ error: LOGIN_REQUIRED_ERROR }).min(1, { error: LOGIN_REQUIRED_ERROR }).max(1000),
  },
  { error: INVALID_JSON_ERROR },
);

// ---------------------------------------------------------------------------
// Venue manager elevation

export const MANAGER_ELEVATION_REQUIRED_ERROR = "Задолжителни се името и лозинката.";
export const managerElevationBody = z.object(
  {
    name: z.string({ error: MANAGER_ELEVATION_REQUIRED_ERROR }).min(1, { error: MANAGER_ELEVATION_REQUIRED_ERROR }).max(NAME_MAX),
    password: z.string({ error: MANAGER_ELEVATION_REQUIRED_ERROR }).min(1, { error: MANAGER_ELEVATION_REQUIRED_ERROR }).max(1000),
  },
  { error: INVALID_JSON_ERROR },
);
export const managerDeauthorizeBody = z.object(
  { token: z.string({ error: INVALID_JSON_ERROR }).min(1) },
  { error: INVALID_JSON_ERROR },
);

// ---------------------------------------------------------------------------
// Venue events (gated: manager or owner elevation required — Plan 2)

export const EVENT_INPUT_REQUIRED_ERROR = "Внесете ги задолжителните податоци за настанот.";
const eventStatus = z.enum(["preparation", "confirmed", "in_progress", "completed", "cancelled"]);
const eventType = z.enum([
  "wedding", "birthday", "baptism", "graduation", "corporate", "anniversary", "family",
  "conference", "presentation", "seminar", "team_building", "new_year", "school", "baby_shower", "other",
]);
const eventContactsShape = {
  contact_email: z.string().max(254).nullable().optional(),
  contact_email_2: z.string().max(254).nullable().optional(),
  contact_phone: z.string().max(50).nullable().optional(),
};

// Bug fix (security review): create_event_credentials used to be called
// directly from the browser against an RPC grantable to any authenticated
// staff session (0111 revoked that grant) — credentials are now created
// server-side, inside the same manager-gated event-creation route, so this
// shape has to travel in the same request body as the rest of the event.
const eventCredentialsShape = {
  username: z.string({ error: EVENT_INPUT_REQUIRED_ERROR }).min(1).max(NAME_MAX),
  password: z.string({ error: "Лозинката мора да има најмалку 10 знаци." }).min(10).max(200),
};

export const EVENT_DATE_INVALID_ERROR = "Внесете важечки датум (ГГГГ-ММ-ДД).";

// Final review finding: a malformed event_date (not even the right shape,
// or a calendar date that doesn't exist, e.g. 2026-02-30) used to pass this
// schema as any non-empty string, then fail deep in the database with a
// generic "couldn't save" message that never says why.
const eventDate = z.string({ error: EVENT_INPUT_REQUIRED_ERROR }).refine((v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, { error: EVENT_DATE_INVALID_ERROR });

export const createEventBody = z
  .object(
    {
      couple_names: z.string({ error: EVENT_INPUT_REQUIRED_ERROR }).min(1).max(NAME_MAX),
      event_date: eventDate,
      start_time: z.string().nullable().optional(),
      end_time: z.string().nullable().optional(),
      event_type: eventType.optional(),
      status: eventStatus.optional(),
      guest_count_estimate: z.number().int().min(0).nullable().optional(),
      room_ids: z.array(uuid).max(50),
      menu_template_ids: z.array(uuid).max(20),
      contacts: z.object(eventContactsShape),
      credentials: z.object(eventCredentialsShape),
      // Optional, set in the same insert as the rest of the event (security
      // review fix — see CreateEventInput in lib/venue/events.ts for why
      // this isn't a follow-up updateEventFinanceViaApi call anymore).
      total_price: z.number().min(0).max(1e12).nullable().optional(),
      deposit_paid: z.number().min(0).max(1e12).nullable().optional(),
      // The event's own menu, built in the new-event form (plan feature "custom_menu").
      custom_menu: z
        .object({ name: z.string().trim().min(1).max(200), item_ids: z.array(uuid).max(200) })
        .nullable()
        .optional(),
    },
    { error: EVENT_INPUT_REQUIRED_ERROR },
  )
  .refine((v) => !v.total_price || !v.deposit_paid || v.deposit_paid <= v.total_price, {
    error: DEPOSIT_OVER_TOTAL_ERROR,
    path: ["deposit_paid"],
  });

export const updateEventBody = z.object(
  {
    couple_names: z.string({ error: EVENT_INPUT_REQUIRED_ERROR }).min(1).max(NAME_MAX),
    event_date: eventDate,
    start_time: z.string().nullable(),
    end_time: z.string().nullable(),
    status: eventStatus,
    event_type: eventType,
    guest_count_estimate: z.number().int().min(0).nullable(),
    room_ids: z.array(uuid).max(50),
    added_menu_ids: z.array(uuid).max(20),
    removed_menu_ids: z.array(uuid).max(20),
  },
  { error: EVENT_INPUT_REQUIRED_ERROR },
);

export const updateEventContactBody = z.object(
  {
    contact_email: z.string().max(254).nullable(),
    contact_email_2: z.string().max(254).nullable(),
    contact_phone: z.string().max(50).nullable(),
  },
  { error: EVENT_INPUT_REQUIRED_ERROR },
);

export const updateEventFinanceBody = z
  .object(
    {
      total_price: z.number().min(0).max(1e12).nullable(),
      deposit_paid: z.number().min(0).max(1e12).nullable(),
    },
    { error: EVENT_INPUT_REQUIRED_ERROR },
  )
  // Final review finding: the form already blocks this, but the route
  // itself accepted any deposit regardless of the total price — a direct
  // API call could still save one, same class of gap client-only checks
  // always leave open.
  .refine((v) => v.total_price === null || v.deposit_paid === null || v.deposit_paid <= v.total_price, {
    error: DEPOSIT_OVER_TOTAL_ERROR,
    path: ["deposit_paid"],
  });

// ---------------------------------------------------------------------------
// Public: RSVP (Macedonian messages: guests read them, A18)

export const RSVP_REQUIRED_ERROR = "Внесете име и одговор.";
export const RSVP_INVALID_ERROR = "Неважечки податоци во одговорот.";
export const RSVP_NOT_FOUND_ERROR = "Поканата не е пронајдена.";
export const RSVP_FAILED_ERROR = "Одговорот не е испратен. Обидете се повторно.";
export const RSVP_ANSWERS = ["confirmed", "declined", "later"] as const;
const PARTY_SIZE_ERROR = `Бројот на лица мора да е цел број од 1 до ${PARTY_SIZE_MAX}.`;
const CHILDREN_MAX = 20;

export const rsvpBody = z
  .object(
    {
      // Optional only with a personal link's token, which names the guest (A1).
      full_name: z.string({ error: RSVP_REQUIRED_ERROR }).max(NAME_MAX, { error: "Името е предолго." }).optional(),
      guest_token: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/, { error: RSVP_INVALID_ERROR }).optional(),
      status: z.enum(RSVP_ANSWERS, { error: RSVP_INVALID_ERROR }).optional(),
      // The yes/no body a page opened before `status` existed still sends.
      attending: z.boolean({ error: RSVP_REQUIRED_ERROR }).optional(),
      party_size: z
        .number({ error: PARTY_SIZE_ERROR })
        .int({ error: PARTY_SIZE_ERROR })
        .min(1, { error: PARTY_SIZE_ERROR })
        .max(PARTY_SIZE_MAX, { error: PARTY_SIZE_ERROR })
        .optional(),
      children_count: z.number().int().min(0).max(CHILDREN_MAX, { error: RSVP_INVALID_ERROR }).optional(),
      menu_counts: z.record(uuid, z.number().int().min(1).max(PARTY_SIZE_MAX), { error: RSVP_INVALID_ERROR }).optional(),
      allergies: z.string().max(300, { error: "Алергиите се предолги (најмногу 300 знаци)." }).nullable().optional(),
      comment: z.string().max(500, { error: "Коментарот е предолг (најмногу 500 знаци)." }).nullable().optional(),
    },
    { error: RSVP_REQUIRED_ERROR },
  )
  .refine((body) => body.full_name !== undefined || body.guest_token !== undefined, { error: RSVP_REQUIRED_ERROR })
  .refine((body) => body.status !== undefined || body.attending !== undefined, { error: RSVP_REQUIRED_ERROR });

/** A16: "Каде седам?" by name on the shared invitation. */
export const seatLookupBody = z.object(
  { name: z.string({ error: "Внесете име и презиме." }).trim().min(1, { error: "Внесете име и презиме." }).max(NAME_MAX, { error: "Името е предолго." }) },
  { error: "Внесете име и презиме." },
);

// ---------------------------------------------------------------------------
// Public: venue contact form and signup

export const CONTACT_REQUIRED_ERROR = "Внесете име, е-пошта и порака.";
export const CONTACT_TOO_LONG_ERROR = "Името, е-поштата или пораката се предолги.";
const requiredContactText = (max: number) =>
  z
    .string({ error: CONTACT_REQUIRED_ERROR })
    .refine((v) => v.trim().length > 0, { error: CONTACT_REQUIRED_ERROR })
    .refine((v) => v.length <= max, { error: CONTACT_TOO_LONG_ERROR });
export const contactMessageBody = z.object(
  {
    name: requiredContactText(NAME_MAX),
    email: requiredContactText(254),
    message: requiredContactText(TEXT_MAX),
  },
  { error: CONTACT_REQUIRED_ERROR },
);

export const VENUE_NAME_REQUIRED_ERROR = "Внесете име на локалот.";
export const venueSignupBody = z.object(
  {
    venue_name: z
      .string({ error: VENUE_NAME_REQUIRED_ERROR })
      .refine((v) => v.trim().length > 0, { error: VENUE_NAME_REQUIRED_ERROR })
      .refine((v) => v.trim().length <= NAME_MAX, { error: "Името на локалот е предолго." }),
    owner_name: z
      .string({ error: "Внесете име на сопственикот." })
      .refine((v) => v.trim().length > 0, { error: "Внесете име на сопственикот." })
      .refine((v) => v.trim().length <= NAME_MAX, { error: "Името на сопственикот е предолго." }),
    owner_password: z
      .string({ error: "Лозинката за менаџер мора да има најмалку 8 знаци." })
      .min(8, { error: "Лозинката за менаџер мора да има најмалку 8 знаци." })
      .max(200),
  },
  { error: VENUE_NAME_REQUIRED_ERROR },
);

// ---------------------------------------------------------------------------
// Support tickets (venue + couple dashboards): one submission shape shared
// by both routes.

export const SUPPORT_TICKET_REQUIRED_ERROR = "Внесете име, проблем и опис.";
const requiredSupportText = (max: number) =>
  z
    .string({ error: SUPPORT_TICKET_REQUIRED_ERROR })
    .refine((v) => v.trim().length > 0, { error: SUPPORT_TICKET_REQUIRED_ERROR })
    .refine((v) => v.length <= max, { error: CONTACT_TOO_LONG_ERROR });
export const supportTicketBody = z.object(
  {
    name: requiredSupportText(NAME_MAX),
    problem: requiredSupportText(NAME_MAX),
    description: requiredSupportText(TEXT_MAX),
  },
  { error: SUPPORT_TICKET_REQUIRED_ERROR },
);

// ---------------------------------------------------------------------------
// Venue privacy (DATA-006). `confirm` is what the staff member typed; the
// route compares it with the couple's names / the venue name.

const confirmText = z.string().max(400);
export const privacyEraseEventBody = z.object({ event_id: uuid, confirm: confirmText });
export const privacyDeleteAccountBody = z.object({ confirm: confirmText });

// ---------------------------------------------------------------------------
// Owner-only manager management (Plan 3)

export const ADD_MANAGER_REQUIRED_ERROR = "Внесете име и лозинка.";
export const addManagerBody = z.object(
  {
    name: z.string({ error: ADD_MANAGER_REQUIRED_ERROR }).min(1).max(NAME_MAX),
    password: z.string({ error: "Лозинката мора да има најмалку 8 знаци." }).min(8).max(200),
  },
  { error: ADD_MANAGER_REQUIRED_ERROR },
);

export const CURRENT_PASSWORD_REQUIRED_ERROR = "Внесете ја тековната лозинка.";

// Final review finding: a manager could change their own password without
// proving they know the current one — anyone at an unattended computer with
// a manager already logged in could lock the real manager out.
export const changeManagerPasswordBody = z.object(
  {
    currentPassword: z.string({ error: CURRENT_PASSWORD_REQUIRED_ERROR }).min(1, { error: CURRENT_PASSWORD_REQUIRED_ERROR }),
    newPassword: z.string({ error: "Лозинката мора да има најмалку 8 знаци." }).min(8).max(200),
  },
  { error: "Лозинката мора да има најмалку 8 знаци." },
);

export const regenerateEventPasswordBody = z.object(
  { password: z.string({ error: "Лозинката мора да има најмалку 10 знаци." }).min(10).max(200) },
  { error: "Лозинката мора да има најмалку 10 знаци." },
);

// ---------------------------------------------------------------------------
// Parsing helper

export type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Parses `value` with `schema`. On failure returns the first issue's message:
 * the schema's own message when it declares one, else `defaultMessage`.
 */
export function parseInput<T>(schema: z.ZodType<T>, value: unknown, defaultMessage: string): ParseResult<T> {
  const result = schema.safeParse(value, { error: () => defaultMessage });
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.issues[0]?.message ?? defaultMessage };
}
