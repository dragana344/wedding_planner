"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./Icon";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/** The venue name / role button in the top bar used to be purely decorative
 * (a chevron with no onClick) — this gives it the dropdown its own styling
 * already implied: quick links to Поставки and signing out, without having
 * to navigate there first. */
export function AccountMenu({ venueName, userRole }: { venueName: string; userRole: string }) {
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    setIsSigningOut(true);
    await createBrowserSupabaseClient().auth.signOut({ scope: "local" });
    router.push("/login");
  }

  return (
    <div className="who-wrap" ref={wrapRef}>
      <button className="who" type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="user-circle" size="lg" style={{ color: "var(--ink-2)" }} />
        <span>
          <span className="n">{venueName}</span>
          <br />
          <span className="r">{userRole}</span>
        </span>
        <Icon name="down" size="sm" style={{ color: "var(--faint)" }} />
      </button>
      {open ? (
        <div className="who-menu" role="menu">
          <Link href="/venue/settings" role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="gear" size="sm" /> Поставки
          </Link>
          <button type="button" role="menuitem" onClick={handleSignOut} disabled={isSigningOut}>
            <Icon name="left" size="sm" /> {isSigningOut ? "Се одјавува..." : "Одјави се"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
