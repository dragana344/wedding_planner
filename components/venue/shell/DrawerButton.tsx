"use client";

import type { Ref } from "react";

/** The top bar's "Мени" button that opens the navigation drawer on phones (D1). */
export function DrawerButton({ open, onClick, buttonRef }: { open: boolean; onClick: () => void; buttonRef: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="burger"
      aria-label="Мени"
      aria-controls="panel-nav"
      aria-expanded={open}
      onClick={onClick}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}
