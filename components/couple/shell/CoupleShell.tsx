"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/venue/shell/Icon";
import { IconSprite } from "@/components/venue/shell/IconSprite";
import { LogoutButton } from "@/components/couple/LogoutButton";
import { LockedContent } from "@/components/entitlements/LockedBanner";
import type { FeatureKey } from "@/lib/entitlements/features";
import { DrawerButton } from "@/components/venue/shell/DrawerButton";
import { useDrawer } from "@/components/venue/shell/useDrawer";
import { buildCoupleNavItems, matchCoupleNavItem, COUPLE_NAV_GROUP_LABELS, type CoupleNavDots } from "./nav";
import { formatMkDate } from "@/lib/date";
import { BrandMark } from "@/components/venue/shell/BrandMark";
import type { BrandVars } from "@/lib/venue/brand-palette";

export function CoupleShell({
  coupleNames,
  eventDate,
  rooms,
  lockedFeatures = [],
  dots,
  brand,
  children,
}: {
  /** The hosting venue's logo and accent colour (0087), when its plan includes branding. */
  brand?: { logoUrl: string | null; vars: BrandVars | null };
  coupleNames: string;
  eventDate: string;
  rooms: { id: string; name: string }[];
  /** Feature keys the couple's plan does not include (admin dashboard spec
   * §4.4). Locks the matching nav items and shows LockedBanner on their
   * pages. Defaults to none locked, so existing callers keep working. */
  lockedFeatures?: FeatureKey[];
  /** Sections with something new for the couple. */
  dots?: CoupleNavDots;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mini, setMini] = useState(false);
  const { open: drawerOpen, toggle: toggleDrawer, close: closeDrawer, drawerRef, buttonRef } = useDrawer();
  const navItems = buildCoupleNavItems(rooms, dots);
  const active = matchCoupleNavItem(pathname, navItems);
  // Пакети has no nav entry (it is reached from a locked section), so it
  // needs its own heading instead of borrowing Почетна's.
  const heading = pathname.startsWith("/couple/packages")
    ? { title: "ПАКЕТИ", subtitle: "Што вклучува секој пакет" }
    : { title: active?.title ?? "", subtitle: active?.subtitle ?? "" };
  const isLocked = (feature?: FeatureKey) => Boolean(feature && lockedFeatures.includes(feature));

  return (
    <div className={`vp app${mini ? " mini" : ""}`} style={(brand?.vars ?? undefined) as React.CSSProperties | undefined}>
      <IconSprite />

      <button
        className="side-toggle"
        type="button"
        onClick={() => setMini((v) => !v)}
        aria-label={mini ? "Прошири мени" : "Собери мени"}
        aria-expanded={!mini}
      >
        <Icon name={mini ? "right" : "left"} size="sm" />
      </button>

      <aside id="panel-nav" ref={drawerRef} className={`side${drawerOpen ? " open" : ""}`}>

        <div className="brand">
          <BrandMark logoUrl={brand?.logoUrl} />
          <div>
            <div className="brand-name">{coupleNames}</div>
            <div className="brand-sub">ВАШИОТ НАСТАН</div>
          </div>
        </div>

        <nav className="nav" aria-label="Главна навигација">
          {navItems.map((item, index) => {
            const showGroupLabel = item.group && item.group !== navItems[index - 1]?.group;
            return (
              <Fragment key={item.href}>
                {showGroupLabel ? <div className="nav-sec">{COUPLE_NAV_GROUP_LABELS[item.group!]}</div> : null}
                <Link
                  href={item.href}
                  className={[
                    item.href === active?.href ? "on" : "",
                    item.ready ? "" : "soon",
                  ].filter(Boolean).join(" ")}
                  aria-current={item.href === active?.href ? "page" : undefined}
                  data-locked={isLocked(item.feature) ? "true" : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.dot ? (
                    <>
                      <span className="unseen-dot" aria-hidden="true" style={{ marginLeft: 6 }} />
                      <span className="sr-only"> (не е видено)</span>
                    </>
                  ) : null}
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
              </Fragment>
            );
          })}
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

        {isLocked(active?.feature) ? <LockedContent audience="couple">{children}</LockedContent> : children}
      </div>
    </div>
  );
}
