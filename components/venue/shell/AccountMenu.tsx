"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useManagerElevation, reportElevationRejected } from "./ManagerElevationContext";

export function AccountMenu({ venueName, userRole }: { venueName: string; userRole: string }) {
  const [open, setOpen] = useState(false);
  const [showElevateForm, setShowElevateForm] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [elevateError, setElevateError] = useState<string | null>(null);
  const [isElevating, setIsElevating] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false);
  const [currentManagerPassword, setCurrentManagerPassword] = useState("");
  const [newManagerPassword, setNewManagerPassword] = useState("");
  const [changePasswordStatus, setChangePasswordStatus] = useState<string | null>(null);
  const [changePasswordIsError, setChangePasswordIsError] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { managerName, isOwner, token, elevate, deAuthorize } = useManagerElevation();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowElevateForm(false);
        setShowChangePasswordForm(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setShowElevateForm(false);
        setShowChangePasswordForm(false);
      }
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
    // A hard navigation, not router.push: the login page's server-side
    // check reads the session from cookies, and a client-side transition
    // right after signOut() can race ahead of the auth SDK's cookie clear,
    // landing back on the venue dashboard instead of /login.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  async function handleElevateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setElevateError(null);
    setIsElevating(true);
    const result = await elevate(name, password);
    setIsElevating(false);
    if (!result.ok) {
      setElevateError(result.error);
      return;
    }
    setName("");
    setPassword("");
    setShowElevateForm(false);
  }

  /** Back to the menu list from either form, forgetting what was typed. */
  function backToMenu() {
    setShowElevateForm(false);
    setShowChangePasswordForm(false);
    setElevateError(null);
    setChangePasswordStatus(null);
    setPassword("");
    setCurrentManagerPassword("");
    setNewManagerPassword("");
  }

  // After a successful change the manager login has just ended (see below),
  // so the form gives way to the message and a way back.
  const passwordChanged = changePasswordStatus !== null && !changePasswordIsError;

  async function handleChangePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChangePasswordStatus(null);
    setIsChangingPassword(true);
    try {
      const response = await fetch("/api/venue/managers/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-venue-manager-token": token ?? "" },
        body: JSON.stringify({ currentPassword: currentManagerPassword, newPassword: newManagerPassword }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 403) reportElevationRejected();
        setChangePasswordIsError(true);
        setChangePasswordStatus(data?.error ?? "Лозинката не можеше да се смени.");
        return;
      }
      setCurrentManagerPassword("");
      setNewManagerPassword("");
      setChangePasswordIsError(false);
      setChangePasswordStatus("Лозинката е сменета. Најавете се повторно како менаџер со новата лозинка.");
      // The server just revoked every elevation for this manager, including
      // the one this tab is holding (final review finding) — drop it here
      // too, instead of leaving the UI showing a token the server no longer
      // honours.
      deAuthorize();
    } catch {
      setChangePasswordIsError(true);
      setChangePasswordStatus("Лозинката не можеше да се смени.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <div className="who-wrap" ref={wrapRef}>
      <button className="who" type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="user-circle" size="lg" style={{ color: "var(--ink-2)" }} />
        <span>
          <span className="n">{venueName}</span>
          <br />
          <span className="r">{managerName ? `Менаџер: ${managerName}` : userRole}</span>
        </span>
        <Icon name="down" size="sm" style={{ color: "var(--faint)" }} />
      </button>
      {open ? (
        <div className="who-menu" role="menu">
          {showElevateForm ? (
            <form onSubmit={handleElevateSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 10px" }}>
              <div>
                <label className="lab-s" htmlFor="elevate-name">Име</label>
                <input id="elevate-name" className="fld" value={name} onChange={(e) => setName(e.target.value)} required disabled={isElevating} />
              </div>
              <div>
                <label className="lab-s" htmlFor="elevate-password">Лозинка</label>
                <input id="elevate-password" className="fld" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isElevating} />
              </div>
              {elevateError ? <p role="alert" style={{ color: "var(--bad)", fontSize: 12.5, margin: 0 }}>{elevateError}</p> : null}
              <button type="submit" className="btn btn-gold" disabled={isElevating}>
                {isElevating ? "Се најавува..." : "Најави се"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={backToMenu} disabled={isElevating}>
                Откажи
              </button>
              {/* No self-service reset: there's only one email per venue, so
               * a "forgot password" link can't be bound to a specific
               * manager. The app owner's decision is that recovery goes
               * through support instead, who reset it from the admin
               * dashboard after verifying the caller by phone. */}
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                Ја заборавивте лозинката? Контактирајте поддршка за ресетирање.
              </p>
            </form>
          ) : showChangePasswordForm ? (
            <form onSubmit={handleChangePasswordSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 10px" }}>
              {passwordChanged ? (
                <>
                  <p role="status" style={{ color: "var(--ok)", fontSize: 12.5, margin: 0 }}>{changePasswordStatus}</p>
                  <button type="button" className="btn btn-ghost" onClick={backToMenu}>
                    Назад
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="lab-s" htmlFor="change-password-current">Тековна лозинка</label>
                    <input
                      id="change-password-current"
                      className="fld"
                      type="password"
                      value={currentManagerPassword}
                      onChange={(e) => setCurrentManagerPassword(e.target.value)}
                      required
                      disabled={isChangingPassword}
                    />
                  </div>
                  <div>
                    <label className="lab-s" htmlFor="change-password-new">Нова лозинка</label>
                    <input
                      id="change-password-new"
                      className="fld"
                      type="password"
                      value={newManagerPassword}
                      onChange={(e) => setNewManagerPassword(e.target.value)}
                      minLength={8}
                      required
                      disabled={isChangingPassword}
                    />
                  </div>
                  {changePasswordStatus ? <p role="alert" style={{ color: "var(--bad)", fontSize: 12.5, margin: 0 }}>{changePasswordStatus}</p> : null}
                  <button type="submit" className="btn btn-gold" disabled={isChangingPassword}>
                    {isChangingPassword ? "Се зачувува..." : "Зачувај"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={backToMenu} disabled={isChangingPassword}>
                    Откажи
                  </button>
                </>
              )}
            </form>
          ) : (
            <>
              {isOwner ? (
                <Link href="/venue/settings" role="menuitem" onClick={() => setOpen(false)}>
                  <Icon name="gear" size="sm" /> Поставки
                </Link>
              ) : null}
              {managerName ? (
                <>
                  <button type="button" role="menuitem" onClick={() => setShowChangePasswordForm(true)}>
                    <Icon name="gear" size="sm" /> Смени ја мојата лозинка
                  </button>
                  <button type="button" role="menuitem" onClick={() => { deAuthorize(); setOpen(false); }}>
                    <Icon name="left" size="sm" /> Одјави се од менаџер
                  </button>
                </>
              ) : (
                <button type="button" role="menuitem" onClick={() => setShowElevateForm(true)}>
                  <Icon name="user-circle" size="sm" /> Логирај се како менаџер
                </button>
              )}
              <button type="button" role="menuitem" onClick={handleSignOut} disabled={isSigningOut}>
                <Icon name="left" size="sm" /> {isSigningOut ? "Се одјавува..." : "Одјави се"}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
