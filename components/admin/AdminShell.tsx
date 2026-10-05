"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconSprite } from "@/components/venue/shell/IconSprite";
import { Icon } from "@/components/venue/shell/Icon";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ADMIN_NAV, matchAdminNav } from "./nav";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // On the admin host the address bar shows "/venues" while links and the
  // nav use "/admin/venues" (proxy.ts rewrites one to the other), so a page
  // opened directly or refreshed has no "/admin" prefix to match on.
  const active = matchAdminNav(pathname.startsWith("/admin") ? pathname : `/admin${pathname === "/" ? "" : pathname}`);

  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut({ scope: "local" });
    router.push("/admin/login");
  }

  return (
    <div className="vp app">
      <IconSprite />

      <aside className="side">
        <div className="brand">
          <svg className="mark" width="40" height="40" viewBox="0 0 42 42" aria-hidden>
            <path d="M21 4 34 15.5 21 38 8 15.5 21 4Z" fill="#E0B44E" />
            <path d="M21 4 34 15.5H8L21 4Z" fill="#F2D48A" />
            <path d="M21 38 8 15.5h26L21 38Z" fill="#C9992F" />
            <path d="M21 4 15 15.5 21 38l6-22.5L21 4Z" fill="#F6E3AF" opacity=".55" />
          </svg>
          <div>
            <div className="brand-name">КАДЕ СУМ?</div>
            <div className="brand-sub">АДМИН ПАНЕЛ</div>
          </div>
        </div>

        <nav className="nav" aria-label="Главна навигација">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.href === active.href ? "on" : ""}
              aria-current={item.href === active.href ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="top">
          <div className="title-wrap">
            <h1 className="page-title">{active.label}</h1>
          </div>
          <div className="meta">
            <div className="meta-item">
              <button type="button" className="btn btn-ghost" onClick={signOut}>
                Одјави се
              </button>
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
