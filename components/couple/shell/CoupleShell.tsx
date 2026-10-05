"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/venue/shell/Icon";
import { IconSprite } from "@/components/venue/shell/IconSprite";
import { LogoutButton } from "@/components/couple/LogoutButton";
import { LockedBanner } from "@/components/entitlements/LockedBanner";
import type { FeatureKey } from "@/lib/entitlements/features";
import { DrawerButton } from "@/components/venue/shell/DrawerButton";
import { useDrawer } from "@/components/venue/shell/useDrawer";
import { buildCoupleNavItems, matchCoupleNavItem } from "./nav";
import { formatMkDate } from "@/lib/date";

export function CoupleShell({
  coupleNames,
  eventDate,
  rooms,
  lockedFeatures = [],
  children,
}: {
  coupleNames: string;
  eventDate: string;
  rooms: { id: string; name: string }[];
  /** Feature keys the couple's plan does not include (admin dashboard spec
   * §4.4). Locks the matching nav items and shows LockedBanner on their
   * pages. Defaults to none locked, so existing callers keep working. */
  lockedFeatures?: FeatureKey[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mini, setMini] = useState(false);
  const { open: drawerOpen, toggle: toggleDrawer, close: closeDrawer, drawerRef, buttonRef } = useDrawer();
  const navItems = buildCoupleNavItems(rooms);
  const active = matchCoupleNavItem(pathname, navItems);
  // Пакети has no nav entry (it is reached from a locked section), so it
  // needs its own heading instead of borrowing Почетна's.
  const heading = pathname.startsWith("/couple/packages")
    ? { title: "ПАКЕТИ", subtitle: "Што вклучува секој пакет" }
    : { title: active.title, subtitle: active.subtitle };
  const isLocked = (feature?: FeatureKey) => Boolean(feature && lockedFeatures.includes(feature));

  return (
    <div className={`vp app${mini ? " mini" : ""}`}>
      <IconSprite />

      <aside id="panel-nav" ref={drawerRef} className={`side${drawerOpen ? " open" : ""}`}>
        <button
          className="side-toggle"
          type="button"
          onClick={() => setMini((v) => !v)}
          aria-label={mini ? "Прошири мени" : "Собери мени"}
          aria-expanded={!mini}
        >
          <Icon name={mini ? "right" : "left"} size="sm" />
        </button>

        <div className="brand">
          <svg className="mark" width="40" height="40" viewBox="0 0 42 42" aria-hidden>
            <path d="M21 4 34 15.5 21 38 8 15.5 21 4Z" fill="#E0B44E" />
            <path d="M21 4 34 15.5H8L21 4Z" fill="#F2D48A" />
            <path d="M21 38 8 15.5h26L21 38Z" fill="#C9992F" />
            <path d="M21 4 15 15.5 21 38l6-22.5L21 4Z" fill="#F6E3AF" opacity=".55" />
          </svg>
          <div>
            <div className="brand-name">{coupleNames}</div>
            <div className="brand-sub">ВАШИОТ НАСТАН</div>
          </div>
        </div>

        <nav className="nav" aria-label="Главна навигација">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                item.href === active.href ? "on" : "",
                item.ready ? "" : "soon",
              ].filter(Boolean).join(" ")}
              aria-current={item.href === active.href ? "page" : undefined}
              data-locked={isLocked(item.feature) ? "true" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {isLocked(item.feature) ? (
                <>
                  <span aria-hidden="true" style={{ marginLeft: 4 }}>
                    🔒
                  </span>
                  {/* Visually hidden, not aria-hidden: the emoji marker above
                   * is decorative, so without this the link's accessible
                   * name would be just the label and a screen reader user
                   * would never learn the section is locked. */}
                  <span className="sr-only"> (заклучено)</span>
                </>
              ) : null}
            </Link>
          ))}
        </nav>
        <Link href="/privacy" target="_blank" style={{ display: "block", padding: "12px 20px", fontSize: 12.5, color: "var(--side-text)" }}>
          Политика за приватност
        </Link>
      </aside>

      {drawerOpen && <div className="scrim" onClick={closeDrawer} aria-hidden />}

      <div className="main">
        <header className="top">
          <div className="title-wrap">
            <DrawerButton open={drawerOpen} onClick={toggleDrawer} buttonRef={buttonRef} />
            <div>
              <h1 className="page-title">{heading.title}</h1>
              <p className="page-sub">{heading.subtitle}</p>
            </div>
          </div>

          <div className="meta">
            <div className="meta-item">
              <Icon name="cal" size="lg" style={{ color: "var(--ink-2)" }} />
              <div>
                <div className="meta-lab">Датум на настанот</div>
                <div className="meta-val">{formatMkDate(eventDate)}</div>
              </div>
            </div>
            <div className="meta-item">
              <LogoutButton />
            </div>
          </div>
        </header>

        {isLocked(active.feature) ? <LockedBanner audience="couple" /> : null}
        {children}
      </div>
    </div>
  );
}
