import type { FeatureKey } from "@/lib/entitlements/features";

export type CoupleNavItem = {
  href: string;
  icon: string;
  label: string;
  title: string;
  subtitle: string;
  /** false marks a section that exists in the approved design but has no
   * data layer yet — it renders a "Coming soon" placeholder rather than
   * being hidden, so the sidebar matches the design and the gap stays
   * visible. Mirrors the venue panel's own `ready` convention. */
  ready: boolean;
  /** The entitlements feature this section is gated on, if any (admin
   * dashboard spec §4.4). Undefined means the section is never locked. */
  feature?: FeatureKey;
};

/**
 * Seating gets one nav entry per room the event is assigned to — everything
 * else is a fixed section, mirroring the venue panel's sidebar shape.
 */
export function buildCoupleNavItems(rooms: { id: string; name: string }[]): CoupleNavItem[] {
  return [
    { href: "/couple", icon: "home", label: "Почетна", title: "ПОЧЕТНА", subtitle: "Преглед на вашиот настан", ready: true },
    ...rooms.map((room) => ({
      href: `/couple/seating/${room.id}`,
      icon: "tables",
      label: rooms.length > 1 ? `Распоред — ${room.name}` : "Распоред",
      title: "РАСПОРЕД",
      subtitle: room.name,
      ready: true,
      feature: "seating" as const,
    })),
    { href: "/couple/menu", icon: "menu", label: "Мени", title: "МЕНИ", subtitle: "Изберете го вашето мени", ready: true },
    { href: "/couple/agenda", icon: "cal-dot", label: "Агенда", title: "АГЕНДА", subtitle: "Вашиот ден, испланиран", ready: true, feature: "agenda" as const },
    { href: "/couple/locations", icon: "pin", label: "Локации", title: "ЛОКАЦИИ", subtitle: "Каде се случува сè", ready: true, feature: "locations" as const },
    { href: "/couple/guests", icon: "users", label: "Гости", title: "ГОСТИ", subtitle: "Список на гости и потврди", ready: true },
    { href: "/couple/budget", icon: "chart", label: "Буџет", title: "БУЏЕТ", subtitle: "Следете ги трошоците", ready: true, feature: "budget" as const },
    { href: "/couple/checklist", icon: "check", label: "Чеклиста", title: "ЧЕКЛИСТА", subtitle: "Задачи за планирање на свадбата", ready: true, feature: "checklist" as const },
    { href: "/couple/notes", icon: "note", label: "Белешки", title: "БЕЛЕШКИ", subtitle: "Запишете било што, било кога", ready: true, feature: "notes" as const },
    { href: "/couple/invitation", icon: "heart", label: "Покана", title: "ПОКАНА", subtitle: "Создадете и споделете ја вашата покана", ready: true, feature: "invitation" as const },
    { href: "/couple/greetings", icon: "gift", label: "Честитки", title: "ЧЕСТИТКИ", subtitle: "Честитки од вашите гости", ready: false },
    { href: "/couple/messages", icon: "msg", label: "Пораки", title: "ПОРАКИ", subtitle: "Пораки од гостите и локалот", ready: false },
    { href: "/couple/album", icon: "photo", label: "Албум", title: "АЛБУМ", subtitle: "Фотографии од вашето славење", ready: false },
  ];
}

/**
 * Longest-prefix match, so nested routes keep their parent nav item active.
 * "/couple" only matches exactly, otherwise it would win for every route.
 */
export function matchCoupleNavItem(pathname: string, items: CoupleNavItem[]): CoupleNavItem {
  const matches = items.filter((item) =>
    item.href === "/couple" ? pathname === "/couple" : pathname.startsWith(item.href)
  );
  const longest = [...matches].sort((a, b) => b.href.length - a.href.length)[0];
  return longest ?? items[0];
}
