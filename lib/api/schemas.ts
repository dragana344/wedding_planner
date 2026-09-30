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

export const RSVP_STATUSES = ["invited", "confirmed", "declined", "pending"] as const;
export const GUEST_SIDES = ["bride", "groom"] as const;

const partySize = z.number().int().min(1).max(PARTY_SIZE_MAX);

const guestFields = z.object({
  ...noType,
  full_name: name,
  phone: optionalText(50),
  party_size: partySize.nullable().optional(),
  notes: optionalText(TEXT_MAX),
  // "" is tolerated (the route maps it to null) as it was before.
  side: z.union([z.enum(GUEST_SIDES), z.literal("")]).nullable().optional(),
});
export const guestCreateBody = guestFields;
export const guestUpdateBody = z.union([
  z.object({ type: z.literal("status"), rsvp_status: z.enum(RSVP_STATUSES) }),
  z.object({ type: z.literal("side"), side: z.enum(GUEST_SIDES).nullable() }),
  guestFields,
]);

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
// Couple: menu

export const MENU_MODE_ERROR = "Непознат режим на избор.";
export const menuSelectionBody = z.discriminatedUnion(
  "mode",
  [
    z.object({ mode: z.literal("template"), menu_template_id: uuid }),
    z.object({ mode: z.literal("custom"), menu_item_ids: z.array(uuid).max(ID_LIST_MAX).optional() }),
  ],
  { error: MENU_MODE_ERROR },
);

export const menuQuantitiesBody = z.object({
  quantities: z
    .array(
      z.object({
        menu_item_id: uuid,
        guest_count: z.number().int().min(1).max(QUANTITY_MAX).nullable().optional(),
      }),
    )
    .max(ID_LIST_MAX),
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
// Public: RSVP (English messages, as the route always used)

export const RSVP_REQUIRED_ERROR = "full_name and attending are required.";
export const RSVP_INVALID_ERROR = "Invalid RSVP details.";
export const RSVP_NOT_FOUND_ERROR = "Invitation not found.";
export const rsvpBody = z.object(
  {
    full_name: z.string({ error: RSVP_REQUIRED_ERROR }).max(NAME_MAX, { error: "full_name is too long." }),
    attending: z.boolean({ error: RSVP_REQUIRED_ERROR }),
    party_size: z
      .number({ error: `party_size must be a whole number between 1 and ${PARTY_SIZE_MAX}.` })
      .int({ error: `party_size must be a whole number between 1 and ${PARTY_SIZE_MAX}.` })
      .min(1, { error: `party_size must be a whole number between 1 and ${PARTY_SIZE_MAX}.` })
      .max(PARTY_SIZE_MAX, { error: `party_size must be a whole number between 1 and ${PARTY_SIZE_MAX}.` })
      .optional(),
  },
  { error: RSVP_REQUIRED_ERROR },
);

// ---------------------------------------------------------------------------
// Public: venue contact form and signup

export const CONTACT_REQUIRED_ERROR = "Name, email, and message are required.";
export const CONTACT_TOO_LONG_ERROR = "Name, email, or message is too long.";
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

export const VENUE_NAME_REQUIRED_ERROR = "Venue name is required.";
export const venueSignupBody = z.object(
  {
    venue_name: z
      .string({ error: VENUE_NAME_REQUIRED_ERROR })
      .refine((v) => v.trim().length > 0, { error: VENUE_NAME_REQUIRED_ERROR })
      .refine((v) => v.trim().length <= NAME_MAX, { error: "Venue name is too long." }),
  },
  { error: VENUE_NAME_REQUIRED_ERROR },
);

// ---------------------------------------------------------------------------
// Venue privacy (DATA-006). `confirm` is what the staff member typed; the
// route compares it with the couple's names / the venue name.

const confirmText = z.string().max(400);
export const privacyEraseEventBody = z.object({ event_id: uuid, confirm: confirmText });
export const privacyDeleteAccountBody = z.object({ confirm: confirmText });

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
