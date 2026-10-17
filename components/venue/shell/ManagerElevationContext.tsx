"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ElevationState = {
  token: string;
  managerName: string;
  expiresAt: string;
  isOwner: boolean;
  passwordResetNoticeAt: string | null;
} | null;

type ManagerElevationValue = {
  managerName: string | null;
  isOwner: boolean;
  elevate: (name: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  deAuthorize: () => void;
  /** Later gating work reads this to attach the x-venue-manager-token header on gated requests. */
  token: string | null;
  /** Security review #4: set when support reset this manager's password
   * through the admin panel and not yet acknowledged. Null otherwise. */
  passwordResetNoticeAt: string | null;
  /** Acknowledges the notice server-side so it never shows again, then
   * clears it locally so the banner disappears without waiting for a
   * refresh/re-elevation. */
  dismissPasswordResetNotice: () => Promise<void>;
};

// Exported so tests can pre-seed an elevated state via
// <ManagerElevationContext.Provider value={...}> directly, without going
// through the real elevate()/fetch flow — app code always uses
// ManagerElevationProvider below, never this raw context.
export const ManagerElevationContext = createContext<ManagerElevationValue | null>(null);

// Final review finding: the client never noticed when its elevation had
// quietly stopped being valid on the server (4-hour expiry, an admin reset,
// the manager being removed) — it kept showing "Менаџер: X" and gated
// buttons until the next action 403'd, which just looked like a random
// error. Gated fetches outside React (lib/venue/events-client.ts) and
// outside this provider's own tree can't call useManagerElevation(), so the
// mounted provider registers itself here; any 403 from a gated endpoint —
// wherever it's made — reports through this module-level hook instead of
// needing the token threaded back up to clear it.
let onElevationRejected: (() => void) | null = null;
export function reportElevationRejected(): void {
  onElevationRejected?.();
}

/** Elevation state lives only in this component's React state — never a
 * cookie, never localStorage. PanelShell (the host of this provider) is
 * rendered fresh per page load in this app, so a plain useState initializer
 * already satisfies "drops on refresh" with no extra code; do not add any
 * persistence here. */
export function ManagerElevationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ElevationState>(null);

  // Covers the common case (the 4-hour expiry just runs out) without
  // waiting for a gated action to fail first.
  useEffect(() => {
    if (!state) return;
    const msRemaining = new Date(state.expiresAt).getTime() - Date.now();
    if (msRemaining <= 0) {
      setState(null);
      return;
    }
    const id = setTimeout(() => setState(null), msRemaining);
    return () => clearTimeout(id);
  }, [state]);

  // Covers the other ways elevation ends early on the server (an admin
  // reset, the manager being removed): any gated fetch that gets a 403
  // reports it here. No need to also call /deauthorize — a 403 already
  // means the server considers this token dead.
  useEffect(() => {
    onElevationRejected = () => setState(null);
    return () => {
      onElevationRejected = null;
    };
  }, []);

  const elevate = useCallback(async (name: string, password: string) => {
    let response: Response;
    try {
      response = await fetch("/api/venue/managers/elevate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
    } catch {
      // Offline, DNS failure, aborted request — fetch itself rejects rather
      // than resolving with a non-ok response; without this the rejection
      // propagated out of elevate() uncaught (final review finding I-2).
      return { ok: false as const, error: "Најавата како менаџер не успеа. Проверете ја интернет-врската." };
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) return { ok: false as const, error: data?.error ?? "Најавата како менаџер не успеа." };
    setState({
      token: data.token,
      managerName: data.managerName,
      expiresAt: data.expiresAt,
      isOwner: Boolean(data.isOwner),
      passwordResetNoticeAt: data.passwordResetNoticeAt ?? null,
    });
    return { ok: true as const };
  }, []);

  const dismissPasswordResetNotice = useCallback(async () => {
    if (!state) return;
    const token = state.token;
    // Optimistic: drop it from view immediately rather than waiting on the
    // network round trip — worst case (the request fails) it can reappear
    // next elevation, same as never having dismissed it.
    setState((prev) => (prev ? { ...prev, passwordResetNoticeAt: null } : prev));
    try {
      await fetch("/api/venue/managers/password-reset-notice/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {
      // Best-effort — see deAuthorize's identical rationale above.
    }
  }, [state]);

  const deAuthorize = useCallback(() => {
    if (state) {
      // Best-effort, fire-and-forget: the token is already being dropped
      // from state below regardless of whether this call ever lands. Wraps
      // the fetch() call itself, not just its promise, in try/catch — a
      // bare `fetch(...).catch(...)` throws synchronously, uncaught, if
      // fetch itself throws instead of returning a rejected promise (same
      // class of bug as elevate()'s own network-failure fix, final review
      // finding).
      (async () => {
        try {
          await fetch("/api/venue/managers/deauthorize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: state.token }),
          });
        } catch {
          // Nothing to do — the token drops from this tab's state either way.
        }
      })();
    }
    setState(null);
  }, [state]);

  return (
    <ManagerElevationContext.Provider
      value={{
        managerName: state?.managerName ?? null,
        isOwner: state?.isOwner ?? false,
        token: state?.token ?? null,
        passwordResetNoticeAt: state?.passwordResetNoticeAt ?? null,
        elevate,
        deAuthorize,
        dismissPasswordResetNotice,
      }}
    >
      {children}
    </ManagerElevationContext.Provider>
  );
}

export function useManagerElevation(): ManagerElevationValue {
  const ctx = useContext(ManagerElevationContext);
  if (!ctx) throw new Error("useManagerElevation must be used within ManagerElevationProvider");
  return ctx;
}
