"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Makes the browser's Back button work after an in-page anchor link.
 *
 * A plain `#section` link adds a history entry the Next.js router knows
 * nothing about. Going Back to it from another page changes the address but
 * the router treats it as a mere hash change and keeps showing the page you
 * left. When that happens (an entry without router state, on a different
 * path than the one on screen), load the address for real.
 */
export function HistoryGuard() {
  const pathname = usePathname();
  const shown = useRef(pathname);

  useEffect(() => {
    shown.current = pathname;
  }, [pathname]);

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      if (event.state === null && window.location.pathname !== shown.current) window.location.reload();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return null;
}
