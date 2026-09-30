"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconSprite } from "./IconSprite";
import { Icon } from "./Icon";
import { NAV_ITEMS, matchNavItem } from "./nav";
import { OnboardingTour } from "./OnboardingTour";
import { DrawerButton } from "./DrawerButton";
import { useDrawer } from "./useDrawer";

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
  userRole = "Менаџер",
  children,
}: {
  venueName: string;
  userRole?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mini, setMini] = useState(false);
  const { open: drawerOpen, toggle: toggleDrawer, close: closeDrawer, drawerRef, buttonRef } = useDrawer();
  const now = useNow();
  const active = matchNavItem(pathname);

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
            <div className="brand-name">{venueName}</div>
            <div className="brand-sub">ПАНЕЛ ЗА УПРАВУВАЊЕ</div>
          </div>
        </div>

        <nav className="nav" aria-label="Главна навигација">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-tour={item.href}
              className={[
                item.href === active.href ? "on" : "",
                item.ready ? "" : "soon",
              ].filter(Boolean).join(" ")}
              aria-current={item.href === active.href ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <Link className="quick" href="/venue/reservations">
          <b>
            <Icon name="bolt" />
            <span>НОВА РЕЗЕРВАЦИЈА</span>
          </b>
          <span>
            Резервирај маса / термин
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
              <button className="who" type="button">
                <Icon name="user-circle" size="lg" style={{ color: "var(--ink-2)" }} />
                <span>
                  <span className="n">{venueName}</span>
                  <br />
                  <span className="r">{userRole}</span>
                </span>
                <Icon name="down" size="sm" style={{ color: "var(--faint)" }} />
              </button>
            </div>
          </div>
        </header>

        {children}
      </div>

      <Suspense fallback={null}>
        <OnboardingTour />
      </Suspense>
    </div>
  );
}
