import type { Guest, GuestStats } from "@/lib/couple/guests";
import type { PublicInvitation } from "@/lib/couple/invitations";
import type { Invitee } from "@/lib/couple/rsvp";
import { FEATURES, type FeatureMap } from "@/lib/entitlements/features";

// Invented data shared by the stories. Nothing here comes from a real venue.

export const EVENT_ID = "00000000-0000-4000-8000-000000000001";
export const VENUE_ID = "00000000-0000-4000-8000-000000000002";

export const invitation: PublicInvitation = {
  couple_names: "Ана & Марко",
  event_date: "2026-11-14",
  start_time: "18:00:00",
  event_type: "wedding",
  venue_name: "Ресторан Панорама",
  room_names: ["Голема сала"],
  template_id: "romantic-floral",
  message: "Со голема радост ве покануваме да бидете дел од нашиот најубав ден.",
  photo_path: null,
  agenda: [
    { time: "17:00", title: "Венчавка во црква" },
    { time: "18:00", title: "Пречек на гости" },
    { time: "19:30", title: "Прв танц" },
    { time: "20:00", title: "Вечера" },
    { time: null, title: "Торта" },
  ],
  locations: [
    { label: "Црква Св. Климент", address: "бул. Партизански Одреди, Скопје", map_url: null },
    { label: "Ресторан Панорама", address: "Водно бб, Скопје", map_url: "https://maps.google.com/?q=Skopje" },
  ],
  menu: [
    { course: "starter", name: "Мезе чинија" },
    { course: "main", name: "Телешко печење со компири" },
    { course: "dessert", name: "Свадбена торта" },
  ],
  seating_enabled: true,
  venue_logo_url: null,
};

export const invitee: Invitee = {
  fullName: "Елена Трајковска",
  rsvpStatus: "invited",
  partySize: 2,
  childrenCount: 0,
  menuChoice: null,
  allergies: null,
  rsvpComment: null,
};

export const GUEST_TOKEN = "storybook-guest-token-000000";

function guest(n: number, over: Partial<Guest>): Guest {
  return {
    id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
    event_id: EVENT_ID,
    full_name: "Гостин",
    phone: null,
    party_size: 1,
    rsvp_status: "pending",
    notes: null,
    side: null,
    invite_token: `storybook-token-${String(n).padStart(12, "0")}`,
    email: null,
    children_count: 0,
    menu_choice: null,
    allergies: null,
    rsvp_comment: null,
    invitation_sent_at: null,
    invitation_channel: null,
    ...over,
  };
}

export const guests: Guest[] = [
  guest(1, { full_name: "Елена Трајковска", phone: "070 123 456", party_size: 2, rsvp_status: "confirmed", side: "bride", menu_choice: "standard", invitation_sent_at: "2026-10-01T10:00:00Z", invitation_channel: "whatsapp" }),
  guest(2, { full_name: "Баба Вера", party_size: 1, rsvp_status: "confirmed", side: "groom", allergies: "глутен", menu_choice: "vegetarian" }),
  guest(3, { full_name: "Игор Николовски", phone: "071 222 333", party_size: 4, children_count: 2, rsvp_status: "invited", side: "groom", invitation_sent_at: "2026-10-02T09:30:00Z", invitation_channel: "viber" }),
  guest(4, { full_name: "Марија Стојанова", email: "marija@example.com", party_size: 2, rsvp_status: "declined", side: "bride", rsvp_comment: "За жал сме на пат." }),
  guest(5, { full_name: "Кум Дејан", party_size: 2, rsvp_status: "pending", side: "groom", notes: "Кум — маса 1" }),
  guest(6, { full_name: "Сара Илиевска", party_size: 1, rsvp_status: "later", side: "bride" }),
];

export const guestStats: GuestStats = {
  total: 6,
  confirmed: 2,
  declined: 1,
  pending: 1,
  invited: 1,
  later: 1,
  totalAttending: 3,
  childrenAttending: 0,
  menu: { standard: 2, posno: 0, vegetarian: 1, unset: 0 },
  invitationsSent: 2,
};

export const emptyStats: GuestStats = {
  total: 0,
  confirmed: 0,
  declined: 0,
  pending: 0,
  invited: 0,
  later: 0,
  totalAttending: 0,
  childrenAttending: 0,
  menu: { standard: 0, posno: 0, vegetarian: 0, unset: 0 },
  invitationsSent: 0,
};

/** Every feature on, no limits: the top plan. */
export const allFeatures = Object.fromEntries(FEATURES.map((f) => [f.key, { enabled: true, limit: null }])) as FeatureMap;

/** A tiny inline logo so branding stories need no file on disk. */
export const DEMO_LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1f6f5b"/><path d="M14 44 26 22l8 13 6-8 10 17z" fill="#fff"/></svg>',
  );
