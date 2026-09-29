"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/venue/shell/Icon";
import { IconSprite } from "@/components/venue/shell/IconSprite";
import { LogoutButton } from "@/components/couple/LogoutButton";
import { buildCoupleNavItems, matchCoupleNavItem } from "./nav";

export function CoupleShell({
  coupleNames,
  eventDate,
  rooms,
  children,
}: {
  coupleNames: string;
  eventDate: string;
  rooms: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mini, setMini] = useState(false);
  const navItems = buildCoupleNavItems(rooms);
  const active = matchCoupleNavItem(pathname, navItems);

  return (
    <div className={`vp app${mini ? " mini" : ""}`}>
      <IconSprite />

      <aside className="side">
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
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <Link href="/privacy" target="_blank" style={{ display: "block", padding: "12px 20px", fontSize: 12.5, color: "var(--muted)" }}>
          Политика за приватност
        </Link>
      </aside>

      <div className="main">
        <header className="top">
          <div className="title-wrap">
            <div>
              <h1 className="page-title">{active.title}</h1>
              <p className="page-sub">{active.subtitle}</p>
            </div>
          </div>

          <div className="meta">
            <div className="meta-item">
              <Icon name="cal" size="lg" style={{ color: "var(--ink-2)" }} />
              <div>
                <div className="meta-lab">Датум на настанот</div>
                <div className="meta-val">{eventDate}</div>
              </div>
            </div>
            <div className="meta-item">
              <LogoutButton />
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
