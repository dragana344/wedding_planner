"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
    <nav className="mkt-nav">
      <b style={{ color: "#fff" }}>КАДЕ СУМ?</b>
      <div>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={s.id === activeId ? "on" : ""}>
            {s.label}
          </a>
        ))}
        <Link href="/login" style={{ color: "#fff", marginLeft: 28, textDecoration: "none", fontWeight: 600, fontSize: "13.5px" }}>
          Најави се
        </Link>
      </div>
    </nav>
  );
}
