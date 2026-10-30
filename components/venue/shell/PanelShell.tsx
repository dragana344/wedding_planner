"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconSprite } from "./IconSprite";
import { Icon } from "./Icon";
import { matchNavItem } from "./nav";
import { VenueNav } from "./VenueNav";
import { OnboardingTour } from "./OnboardingTour";
import { LockedContent } from "@/components/entitlements/LockedBanner";
import type { FeatureKey } from "@/lib/entitlements/features";
import { DrawerButton } from "./DrawerButton";
import { useDrawer } from "./useDrawer";
import { BrandMark } from "@/components/venue/shell/BrandMark";
import type { BrandVars } from "@/lib/venue/brand-palette";
import { TABLE_RESERVATIONS_ENABLED } from "@/lib/venue/demo-scope";
import { AccountMenu } from "./AccountMenu";
import { ManagerElevationProvider } from "./ManagerElevationContext";
import { PasswordResetNotice } from "./PasswordResetNotice";

const MK_MONTHS = [
  "Јануари", "Февруари", "Март", "Април", "Мај", "Јуни",
  "Јули", "Август", "Септември", "Октомври", "Ноември", "Декември",
];
const MK_DAYS = ["Недела", "Понеделник", "Вторник", "Среда", "Четврток", "Петок", "Сабота"];

/**
 * Live clock for the top bar. Rendered only after mount — the server and client
 * would otherwise disagree on the current minute and trip a hydration warning.
 */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function PanelShell({
  venueName,
  lockedFeatures = [],
  brand,
  children,
}: {
  /** The venue's own logo and accent colour (0087), when its plan includes branding. */
  brand?: { logoUrl: string | null; vars: BrandVars | null };
  venueName: string;
  /** Feature keys the venue's plan does not include (admin dashboard spec
   * §4.4). Locks the matching nav items and shows LockedBanner on their
   * pages. Defaults to none locked, so existing callers keep working. */
  lockedFeatures?: FeatureKey[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mini, setMini] = useState(false);
  const { open: drawerOpen, toggle: toggleDrawer, close: closeDrawer, drawerRef, buttonRef } = useDrawer();
  const now = useNow();
  const active = matchNavItem(pathname);
  const isLocked = (feature?: FeatureKey) => Boolean(feature && lockedFeatures.includes(feature));

  return (
    <div className={`vp app${mini ? " mini" : ""}`} style={(brand?.vars ?? undefined) as React.CSSProperties | undefined}>
      <IconSprite />

      <ManagerElevationProvider>
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
            <div className="brand-name">{venueName}</div>
            <div className="brand-sub">ПАНЕЛ ЗА УПРАВУВАЊЕ</div>
          </div>
        </div>

        <VenueNav activeHref={active.href} isLocked={isLocked} />

        <Link className="quick" href={TABLE_RESERVATIONS_ENABLED ? "/venue/reservations" : "/venue/events/new"}>
          <b>
            <Icon name="bolt" />
            <span>{TABLE_RESERVATIONS_ENABLED ? "НОВА РЕЗЕРВАЦИЈА" : "НОВ НАСТАН"}</span>
          </b>
          <span>
            {TABLE_RESERVATIONS_ENABLED ? "Резервирај маса / термин" : "Свадба, роденден, прослава"}
            <Icon name="right" size="sm" />
          </span>
        </Link>

        <div className="devs">
          <b>ОНЛАЈН ПРИСТАП – 24/7</b>
          <p>
            Управувајте со вашиот локал од каде било и во било кое време. Сите податоци се
            синхронизираат во реално време.
          </p>
          <div className="ic-row">
            <div>
              <Icon name="laptop" size="lg" />
              Компјутер
            </div>
            <div>
              <Icon name="tablet" size="lg" />
              Таблет
            </div>
            <div>
              <Icon name="mobile" size="lg" />
              Телефон
            </div>
          </div>
        </div>
      </aside>

      {drawerOpen && <div className="scrim" onClick={closeDrawer} aria-hidden />}

      <div className="main">
        <header className="top">
          <div className="title-wrap">
            <DrawerButton open={drawerOpen} onClick={toggleDrawer} buttonRef={buttonRef} />
            <div>
              <h1 className="page-title">{active.title}</h1>
              <p className="page-sub">{active.subtitle}</p>
            </div>
          </div>

          <div className="meta">
            <div className="meta-item">
              <Icon name="cal" size="lg" style={{ color: "var(--ink-2)" }} />
              <div>
                <div className="meta-lab">Денес е</div>
                <div className="meta-val">
                  {now
                    ? `${String(now.getDate()).padStart(2, "0")} ${MK_MONTHS[now.getMonth()]} ${now.getFullYear()}`
                    : "—"}
                </div>
                <div className="meta-lab">{now ? MK_DAYS[now.getDay()] : ""}</div>
              </div>
            </div>
            <div className="meta-item">
              <Icon name="clock" size="lg" style={{ color: "var(--ink-2)" }} />
              <div className="meta-val">
                {now
                  ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
                  : "—"}
              </div>
            </div>
            <div className="meta-item">
              <AccountMenu venueName={venueName} />
            </div>
          </div>
        </header>

        <PasswordResetNotice />
        {isLocked(active.feature) ? <LockedContent audience="venue">{children}</LockedContent> : children}
      </div>

      <Suspense fallback={null}>
        <OnboardingTour />
      </Suspense>
      </ManagerElevationProvider>
    </div>
  );
}
