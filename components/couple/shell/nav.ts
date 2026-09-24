export type CoupleNavItem = {
  href: string;
  icon: string;
  label: string;
  title: string;
  subtitle: string;
};

/**
 * Seating gets one nav entry per room the event is assigned to — everything
 * else is a fixed section, mirroring the venue panel's sidebar shape.
 */
export function buildCoupleNavItems(rooms: { id: string; name: string }[]): CoupleNavItem[] {
  return [
    { href: "/couple", icon: "home", label: "Overview", title: "OVERVIEW", subtitle: "Your event at a glance" },
    ...rooms.map((room) => ({
      href: `/couple/seating/${room.id}`,
      icon: "tables",
      label: rooms.length > 1 ? `Seating — ${room.name}` : "Seating",
      title: "SEATING",
      subtitle: room.name,
    })),
    { href: "/couple/menu", icon: "menu", label: "Menu", title: "MENU", subtitle: "Choose your menu" },
    { href: "/couple/agenda", icon: "cal-dot", label: "Agenda", title: "AGENDA", subtitle: "Your day, planned out" },
    { href: "/couple/locations", icon: "pin", label: "Locations", title: "LOCATIONS", subtitle: "Where everything happens" },
    { href: "/couple/guests", icon: "users", label: "Guests", title: "GUESTS", subtitle: "Guest list and RSVPs" },
    { href: "/couple/budget", icon: "chart", label: "Budget", title: "BUDGET", subtitle: "Track your spending" },
    { href: "/couple/checklist", icon: "check", label: "Checklist", title: "CHECKLIST", subtitle: "Wedding planning tasks" },
    { href: "/couple/notes", icon: "note", label: "Notes", title: "NOTES", subtitle: "Jot down anything, anytime" },
    { href: "/couple/invitation", icon: "heart", label: "Invitation", title: "INVITATION", subtitle: "Build and share your invite" },
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
