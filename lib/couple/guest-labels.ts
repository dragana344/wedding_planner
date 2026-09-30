// Macedonian labels for guest fields, shared by the couple's guest list, the
// CSV export and the detail panel (no server-only imports: used client-side).
import type { GuestSide, InvitationChannel, MenuChoice, RsvpStatus } from "@/lib/couple/guests";

export const STATUS_LABELS: Record<RsvpStatus, string> = {
  invited: "Поканет",
  pending: "Во исчекување",
  confirmed: "Потврден",
  declined: "Одбиен",
  later: "Ќе одговори подоцна",
};

export const SIDE_LABELS: Record<GuestSide, string> = { bride: "Невеста", groom: "Младоженец" };

export const MENU_LABELS: Record<MenuChoice, string> = { standard: "Стандардно", posno: "Посно", vegetarian: "Вегетаријанско" };

export const CHANNEL_LABELS: Record<InvitationChannel, string> = {
  whatsapp: "WhatsApp",
  viber: "Viber",
  sms: "SMS",
  email: "Email",
  link: "Линк",
};
