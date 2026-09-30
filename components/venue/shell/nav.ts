import type { FeatureKey } from "@/lib/entitlements/features";

/*
 * Venue panel navigation, mirroring the Diamond design prototype's sidebar.
 *
 * `ready: false` marks sections that exist in the approved design but have no
 * data layer yet — they render a styled "Наскоро" placeholder rather than being
 * hidden, so the panel matches the design and the gap stays visible.
 */
export type NavItem = {
  href: string;
  /** Extra path prefixes that should also count as this item's section, for
   * routes nested outside the item's own href (e.g. a room's floor-plan
   * editor lives at /venue/rooms/[id]/floor-plan, not under /venue/tables). */
  matchPrefixes?: string[];
  icon: string;
  label: string;
  title: string;
  subtitle: string;
  ready: boolean;
  /** The entitlements feature this section is gated on, if any (admin
   * dashboard spec §4.4). Undefined means the section is never locked. */
  feature?: FeatureKey;
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/venue",
    icon: "home",
    label: "Контролна табла",
    title: "КОНТРОЛНА ТАБЛА",
    subtitle: "Преглед на вашиот локал денес",
    ready: true,
  },
  {
    href: "/venue/calendar",
    icon: "cal",
    label: "Календар / Планер",
    title: "КАЛЕНДАР / ПЛАНЕР",
    subtitle: "Преглед и управување со сите настани и резервации",
    ready: true,
  },
  {
    href: "/venue/reservations",
    icon: "book",
    label: "Резервации",
    title: "РЕЗЕРВАЦИИ",
    subtitle: "Резервирајте маси и управувајте со сите резервации",
    ready: true,
    feature: "reservations",
  },
  {
    href: "/venue/tables",
    matchPrefixes: ["/venue/rooms"],
    icon: "tables",
    label: "Распоред на маси",
    title: "РАСПОРЕД НА МАСИ",
    subtitle: "Простории, инвентар на маси и планови на сала",
    ready: true,
  },
  {
    href: "/venue/events",
    icon: "cal-dot",
    label: "Настани",
    title: "НАСТАНИ",
    subtitle: "Управувајте со вашите настани и прослави",
    ready: true,
  },
  {
    href: "/venue/clients",
    icon: "user",
    label: "Клиенти",
    title: "КЛИЕНТИ",
    subtitle: "Сите клиенти и организатори",
    ready: true,
  },
  {
    href: "/venue/notifications",
    icon: "mega",
    label: "Известувања",
    title: "ИЗВЕСТУВАЊА",
    subtitle: "Известувања и потсетници",
    ready: false,
  },
  {
    href: "/venue/menus",
    icon: "menu",
    label: "Мени / Пакети",
    title: "МЕНИ / ПАКЕТИ",
    subtitle: "Менија, јадења и пакети што ги нудите",
    ready: true,
  },
  {
    href: "/venue/messages",
    icon: "msg",
    label: "Пораки",
    title: "ПОРАКИ",
    subtitle: "Комуникација со клиенти",
    ready: false,
  },
  {
    href: "/venue/reports",
    icon: "chart",
    label: "Извештаи",
    title: "ИЗВЕШТАИ",
    subtitle: "Аналитика и извештаи за работењето",
    ready: false,
    feature: "reports",
  },
  {
    href: "/venue/settings",
    icon: "gear",
    label: "Поставки",
    title: "ПОСТАВКИ",
    subtitle: "Профил на локалот и поставки",
    ready: true,
  },
  {
    href: "/venue/support",
    icon: "life",
    label: "Поддршка",
    title: "ПОДДРШКА",
    subtitle: "Помош и контакт со поддршка",
    ready: true,
  },
];

/**
 * Longest-prefix match, so nested routes (/venue/events/new) keep their parent
 * nav item active. "/venue" only matches exactly, otherwise it would win for
 * every route in the panel.
 */
export function matchNavItem(pathname: string): NavItem {
  const prefixesOf = (item: NavItem) => [item.href, ...(item.matchPrefixes ?? [])];
  const matches = NAV_ITEMS.filter((item) =>
    prefixesOf(item).some((prefix) => (prefix === "/venue" ? pathname === "/venue" : pathname.startsWith(prefix))),
  );
  const longestMatchLength = (item: NavItem) =>
    Math.max(...prefixesOf(item).filter((prefix) => pathname.startsWith(prefix)).map((p) => p.length));
  return (
    matches.sort((a, b) => longestMatchLength(b) - longestMatchLength(a))[0] ??
    NAV_ITEMS[0]
  );
}
