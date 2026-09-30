"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark, Wordmark } from "@/components/marketing/BrandLogo";

const SECTIONS = [
  { id: "home", label: "Почетна" },
  { id: "platform", label: "За платформата" },
  { id: "how", label: "Како работи" },
  { id: "pricing", label: "Планови" },
  { id: "contact", label: "Контакт" },
];

/** Highlights the nav link for whichever marketing section is currently in view. */
export function MarketingNav() {
  const [activeId, setActiveId] = useState("home");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <nav className={`nav${open ? " open" : ""}`} aria-label="Главна навигација">
      <div className="wrap nav-row">
        <a className="brand" href="#home" aria-label="Каде си? почетна" onClick={() => setOpen(false)}>
          <LogoMark id="nav-mark" className="brand-mark" />
          <Wordmark id="nav-word" className="brand-word" />
        </a>
        <div className="nav-links">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={s.id === activeId ? "on" : ""} onClick={() => setOpen(false)}>
              {s.label}
            </a>
          ))}
        </div>
        <div className="nav-actions">
          <Link href="/login" className="btn btn-ghost btn-sm">
            Најави се
          </Link>
          <Link href="/signup" className="btn btn-red btn-sm">
            Регистрирај се
          </Link>
        </div>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-label="Мени"
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
          </svg>
        </button>
      </div>
    </nav>
  );
}
