"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/venue/shell/Icon";

/**
 * Real browser-history "back", not a fixed link to one list: an event's
 * detail page is reachable both from /admin/events and from inside a
 * venue's own detail page, so a static href back to /admin/events would be
 * wrong whenever you opened it from a venue.
 *
 * Deliberately always calls router.back() rather than trying to decide
 * first: `window.history.length > 1` was tried and dropped — it's true in
 * almost every real session (e.g. right after bouncing through
 * /admin/login → /admin/login/mfa), so it kept picking "there's history, go
 * back" even when that history was the login/MFA screens, not a list page,
 * landing the admin there instead. `document.referrer` doesn't help either:
 * Next's client-side navigations never update it, so it would only ever
 * reflect how this browser tab's very first page load got here, not the
 * in-app click that opened this detail page. There's no reliable way to
 * tell "is there a relevant page behind me" from the client alone, so this
 * takes no fallback target at all: with no real history, router.back() is
 * simply a no-op (the admin stays put, with the sidebar still one click
 * away), which is a safe failure mode, unlike a GUESS that actively sends
 * them to a login/MFA screen.
 */
export function BackButton({ label }: { label: string }) {
  const router = useRouter();
  function goBack() {
    router.back();
  }
  return (
    <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={goBack}>
      <Icon name="left" size="sm" />
      {label}
    </button>
  );
}
