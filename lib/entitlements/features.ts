import { INVITATION_TEMPLATES } from "@/lib/couple/invitation-templates";

// The fixed catalogue of lockable features (admin dashboard spec §4.1).
// Plans and overrides are data; this list is code.

export type FeatureScope = "event" | "venue";
export type FeatureKind = "switch" | "limit";
export type FeatureKey =
  | "invitation" | "invitation_all_templates" | "invitation_photo" | "seating" | "custom_menu"
  | "budget" | "checklist" | "agenda" | "locations" | "notes" | "max_guests"
  | "reservations" | "floor_plan" | "showcase_photos" | "max_rooms" | "max_active_events" | "reports"
  | "photo_album" | "guest_greetings" | "video_greetings" | "reminders" | "personal_invite_links" | "print_qr"
  | "storage_gb" | "photo_retention_days" | "co_organizers"
  | "venue_branding";

export type FeatureDef = { key: FeatureKey; label: string; scope: FeatureScope; kind: FeatureKind };

export const FEATURES: readonly FeatureDef[] = [
  { key: "invitation", label: "Дигитална покана и RSVP", scope: "event", kind: "switch" },
  { key: "invitation_all_templates", label: "Сите дизајни на покани", scope: "event", kind: "switch" },
  { key: "invitation_photo", label: "Фотографија на поканата", scope: "event", kind: "switch" },
  { key: "seating", label: "Распоред на седење", scope: "event", kind: "switch" },
  { key: "custom_menu", label: "Сопствено мени", scope: "event", kind: "switch" },
  { key: "budget", label: "Буџет", scope: "event", kind: "switch" },
  { key: "checklist", label: "Чеклиста", scope: "event", kind: "switch" },
  { key: "agenda", label: "Агенда", scope: "event", kind: "switch" },
  { key: "locations", label: "Локации", scope: "event", kind: "switch" },
  { key: "notes", label: "Белешки", scope: "event", kind: "switch" },
  { key: "max_guests", label: "Максимален број гости", scope: "event", kind: "limit" },
  { key: "reservations", label: "Резервации", scope: "venue", kind: "switch" },
  { key: "floor_plan", label: "Уредувач на распоред на сала", scope: "venue", kind: "switch" },
  { key: "showcase_photos", label: "Фотографии од настани", scope: "venue", kind: "switch" },
  { key: "max_rooms", label: "Максимален број простории", scope: "venue", kind: "limit" },
  { key: "max_active_events", label: "Максимален број активни настани", scope: "venue", kind: "limit" },
  { key: "reports", label: "Извештаи", scope: "venue", kind: "switch" },
  { key: "photo_album", label: "Албум со фотографии од гостите", scope: "event", kind: "switch" },
  { key: "guest_greetings", label: "Честитки од гостите", scope: "event", kind: "switch" },
  { key: "video_greetings", label: "Видео честитки", scope: "event", kind: "switch" },
  { key: "reminders", label: "Потсетници до гостите", scope: "event", kind: "switch" },
  { key: "personal_invite_links", label: "Персонални линкови за покана", scope: "event", kind: "switch" },
  { key: "print_qr", label: "Печатење QR кодови", scope: "event", kind: "switch" },
  { key: "storage_gb", label: "Простор за фотографии (GB)", scope: "event", kind: "limit" },
  { key: "photo_retention_days", label: "Чување на фотографии (денови)", scope: "event", kind: "limit" },
  { key: "co_organizers", label: "Дополнителни организатори", scope: "event", kind: "limit" },
  // 0087: the venue's own logo and accent colour on the panels and guest pages.
  { key: "venue_branding", label: "Брендирање (лого и боја на локалот)", scope: "venue", kind: "switch" },
];

export const FEATURE_KEYS: readonly FeatureKey[] = FEATURES.map((f) => f.key);

export function featureDef(key: FeatureKey): FeatureDef {
  return FEATURES.find((f) => f.key === key)!;
}

export type ResolvedFeature = { enabled: boolean; limit: number | null };
export type FeatureMap = Record<FeatureKey, ResolvedFeature>;

export const LOCKED_MESSAGE = "Оваа функција не е вклучена во вашиот пакет.";

/** Templates open without `invitation_all_templates`; the database checks the same list (0063). */
export const BASIC_TEMPLATE_IDS: readonly string[] = INVITATION_TEMPLATES.filter((t) => !t.premium).map((t) => t.id);
