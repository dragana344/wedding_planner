"use client";

import type { Ref } from "react";
import Link from "next/link";
import { Icon } from "@/components/venue/shell/Icon";

export type TabBarItem = { href: string; label: string; icon: string; active: boolean; badge?: number; dot?: boolean };

/** Phone-only bottom navigation: the most-used sections plus "Повеќе", which
 * opens the full menu (#panel-nav) as a bottom sheet. Hidden above 900px. */
export function BottomTabBar({
  items,
  moreOpen,
  moreActive,
  moreDot,
  onMore,
  moreRef,
}: {
  items: TabBarItem[];
  moreOpen: boolean;
  /** The current page lives in the "Повеќе" menu, not in the bar itself. */
  moreActive: boolean;
  moreDot?: boolean;
  onMore: () => void;
  moreRef: Ref<HTMLButtonElement>;
}) {
  return (
    <nav className="tabbar" aria-label="Брза навигација">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={item.active ? "on" : ""} aria-current={item.active ? "page" : undefined}>
          <span className="tab-ic">
            <Icon name={item.icon} />
            {(item.badge ?? 0) > 0 ? (
              <span className="tab-badge">{item.badge! > 99 ? "99+" : item.badge}</span>
            ) : item.dot ? (
              <span className="tab-dot" aria-hidden="true" />
            ) : null}
          </span>
          <span className="tab-lab">{item.label}</span>
          {item.dot && !(item.badge ?? 0) ? <span className="sr-only"> (ново)</span> : null}
        </Link>
      ))}
      <button
        ref={moreRef}
        type="button"
        className={moreActive || moreOpen ? "on" : ""}
        aria-label="Повеќе"
        aria-controls="panel-nav"
        aria-expanded={moreOpen}
        onClick={onMore}
      >
        <span className="tab-ic">
          <Icon name="dots" />
          {moreDot ? <span className="tab-dot" aria-hidden="true" /> : null}
        </span>
        <span className="tab-lab" aria-hidden="true">
          Повеќе
        </span>
      </button>
    </nav>
  );
}
