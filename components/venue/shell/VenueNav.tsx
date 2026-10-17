"use client";

import Link from "next/link";
import { Icon } from "./Icon";
import { NAV_ITEMS, type NavItem } from "./nav";
import { useManagerElevation } from "./ManagerElevationContext";
import type { FeatureKey } from "@/lib/entitlements/features";

/**
 * Rendered inside <ManagerElevationProvider> (PanelShell can't read the
 * context itself — the provider doesn't exist yet during PanelShell's own
 * render). Items tagged requiresElevation are dropped from the list
 * entirely rather than shown locked, so plain staff never see them.
 */
export function VenueNav({ activeHref, isLocked }: { activeHref: string; isLocked: (feature?: FeatureKey) => boolean }) {
  const { managerName, isOwner } = useManagerElevation();

  const visibleItems = NAV_ITEMS.filter((item: NavItem) => {
    if (item.requiresElevation === "owner") return isOwner;
    if (item.requiresElevation === "manager") return Boolean(managerName);
    return true;
  });

  return (
    <nav className="nav" aria-label="Главна навигација">
      {visibleItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          data-tour={item.href}
          className={[
            item.href === activeHref ? "on" : "",
            item.ready ? "" : "soon",
          ].filter(Boolean).join(" ")}
          aria-current={item.href === activeHref ? "page" : undefined}
          data-locked={isLocked(item.feature) ? "true" : undefined}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
          {item.ready ? null : <span className="soon-tag">Наскоро</span>}
          {item.ready && isLocked(item.feature) ? (
            <>
              <span aria-hidden="true" style={{ marginLeft: 4 }}>
                🔒
              </span>
              <span className="sr-only"> (заклучено)</span>
            </>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
