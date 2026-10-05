export type AdminNavItem = { href: string; icon: string; label: string };

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", icon: "home", label: "Преглед" },
  { href: "/admin/venues", icon: "tables", label: "Локали" },
  { href: "/admin/events", icon: "cal-dot", label: "Настани" },
  { href: "/admin/plans", icon: "chart", label: "Нивоа" },
  { href: "/admin/pricing", icon: "gift", label: "Ценовник" },
  { href: "/admin/messages", icon: "msg", label: "Контакт пораки" },
  { href: "/admin/audit", icon: "book", label: "Дневник на акции" },
  { href: "/admin/system", icon: "life", label: "Систем" },
];

// Longest-prefix match, mirroring components/venue/shell/nav.ts's
// matchNavItem: "/admin" only matches exactly, otherwise it would win for
// every route in the panel.
export function matchAdminNav(pathname: string): AdminNavItem {
  return (
    [...ADMIN_NAV]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => (item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href))) ??
    ADMIN_NAV[0]
  );
}
