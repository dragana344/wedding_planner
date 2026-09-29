"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/venue/shell/Icon";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { updateVenueName } from "@/lib/venue/venue-profile";
import { setLayoutLockPassword } from "@/lib/venue/floorplan";
import { confirmationMatches } from "@/lib/privacy/confirm";
import { MfaSettings } from "@/components/venue/dashboard/MfaSettings";

export function SettingsClient({
  venueId,
  venueName: initialVenueName,
  email: initialEmail,
}: {
  venueId: string;
  venueName: string;
  email: string;
}) {
  const router = useRouter();

  const [venueName, setVenueName] = useState(initialVenueName);
  const [venueNameStatus, setVenueNameStatus] = useState<string | null>(null);
  const [isSavingVenueName, setIsSavingVenueName] = useState(false);

  const [email, setEmail] = useState(initialEmail);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [newLayoutPassword, setNewLayoutPassword] = useState("");
  const [layoutPasswordStatus, setLayoutPasswordStatus] = useState<string | null>(null);
  const [isSavingLayoutPassword, setIsSavingLayoutPassword] = useState(false);

  const [isSigningOut, setIsSigningOut] = useState(false);

  // DATA-006: data export and account deletion.
  const [savedVenueName, setSavedVenueName] = useState(initialVenueName);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const canDeleteAccount = confirmationMatches(deleteConfirm, savedVenueName);

  async function handleSaveVenueName(e: React.FormEvent) {
    e.preventDefault();
    setVenueNameStatus(null);
    setIsSavingVenueName(true);
    try {
      await updateVenueName(venueId, venueName);
      setSavedVenueName(venueName);
      setVenueNameStatus("Зачувано.");
    } catch (err) {
      setVenueNameStatus(err instanceof Error ? err.message : "Не успеа зачувувањето. Обидете се повторно.");
    } finally {
      setIsSavingVenueName(false);
    }
  }

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailStatus(null);
    setIsSavingEmail(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      setEmailStatus("Проверете го инбоксот за да ја потврдите новата е-пошта.");
    } catch (err) {
      setEmailStatus(err instanceof Error ? err.message : "Не успеа менувањето на е-поштата. Обидете се повторно.");
    } finally {
      setIsSavingEmail(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus(null);
    setIsSavingPassword(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordStatus("Лозинката е сменета.");
      setNewPassword("");
    } catch (err) {
      setPasswordStatus(err instanceof Error ? err.message : "Не успеа менувањето на лозинката. Обидете се повторно.");
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleSaveLayoutLockPassword(e: React.FormEvent) {
    e.preventDefault();
    setLayoutPasswordStatus(null);
    setIsSavingLayoutPassword(true);
    try {
      await setLayoutLockPassword(venueId, newLayoutPassword);
      setLayoutPasswordStatus("Зачувано.");
      setNewLayoutPassword("");
    } catch (err) {
      setLayoutPasswordStatus(err instanceof Error ? err.message : "Не успеа зачувувањето. Обидете се повторно.");
    } finally {
      setIsSavingLayoutPassword(false);
    }
  }

  // SEC-017: "global" revokes every refresh token of this user, so other
  // browsers and devices lose access once their current access token expires.
  async function handleSignOut(scope: "local" | "global") {
    setIsSigningOut(true);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut({ scope });
    router.push("/login");
  }

  async function handleExport() {
    setExportStatus(null);
    setIsExporting(true);
    try {
      const res = await fetch("/api/venue/privacy/export");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Не успеа преземањето на податоците.");
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `podatoci-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportStatus(err instanceof Error ? err.message : "Не успеа преземањето на податоците.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!canDeleteAccount) return;
    setDeleteStatus(null);
    setIsDeletingAccount(true);
    try {
      const res = await fetch("/api/venue/privacy/delete-account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: deleteConfirm }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Не успеа бришењето на сметката.");
      }
      // The auth user is gone; clear the local session cookie too.
      await createBrowserSupabaseClient().auth.signOut({ scope: "local" }).catch(() => undefined);
      router.push("/login");
    } catch (err) {
      setDeleteStatus(err instanceof Error ? err.message : "Не успеа бришењето на сметката.");
      setIsDeletingAccount(false);
    }
  }

  return (
    <div className="wrap">
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Име на локалот</h2>
        </div>
        <form onSubmit={handleSaveVenueName} className="ev-form" style={{ padding: "16px 20px" }}>
          <div className="ev-field ev-field-wide">
            <label className="lab-s" htmlFor="settings-venue-name">
              Име
            </label>
            <input
              id="settings-venue-name"
              className="fld"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              required
            />
          </div>
          {venueNameStatus ? <p className="muted" style={{ margin: 0 }}>{venueNameStatus}</p> : null}
          <button type="submit" className="btn btn-gold" disabled={isSavingVenueName}>
            {isSavingVenueName ? "Се зачувува..." : "Зачувај"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Е-пошта</h2>
        </div>
        <form onSubmit={handleSaveEmail} className="ev-form" style={{ padding: "16px 20px" }}>
          <div className="ev-field ev-field-wide">
            <label className="lab-s" htmlFor="settings-email">
              Е-пошта
            </label>
            <input
              id="settings-email"
              className="fld"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {emailStatus ? <p className="muted" style={{ margin: 0 }}>{emailStatus}</p> : null}
          <button type="submit" className="btn btn-gold" disabled={isSavingEmail}>
            {isSavingEmail ? "Се зачувува..." : "Зачувај"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Лозинка</h2>
        </div>
        <form onSubmit={handleSavePassword} className="ev-form" style={{ padding: "16px 20px" }}>
          <div className="ev-field ev-field-wide">
            <label className="lab-s" htmlFor="settings-password">
              Нова лозинка
            </label>
            <input
              id="settings-password"
              className="fld"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {passwordStatus ? <p className="muted" style={{ margin: 0 }}>{passwordStatus}</p> : null}
          <button type="submit" className="btn btn-gold" disabled={isSavingPassword}>
            {isSavingPassword ? "Се зачувува..." : "Зачувај"}
          </button>
        </form>
      </section>

      <MfaSettings />

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Лозинка за заклучување на распоредот</h2>
        </div>
        <form onSubmit={handleSaveLayoutLockPassword} className="ev-form" style={{ padding: "16px 20px" }}>
          <div className="ev-field ev-field-wide">
            <label className="lab-s" htmlFor="settings-layout-password">
              Нова лозинка
            </label>
            <input
              id="settings-layout-password"
              className="fld"
              type="password"
              value={newLayoutPassword}
              onChange={(e) => setNewLayoutPassword(e.target.value)}
              minLength={4}
              required
            />
          </div>
          <p className="ev-hint">Оваа лозинка се бара за отклучување на ѕидови, столбови и врати во уредувачот на распоред.</p>
          {layoutPasswordStatus ? <p className="muted" style={{ margin: 0 }}>{layoutPasswordStatus}</p> : null}
          <button type="submit" className="btn btn-gold" disabled={isSavingLayoutPassword}>
            {isSavingLayoutPassword ? "Се зачувува..." : "Зачувај"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Податоци и приватност</h2>
        </div>
        <div className="ev-form" style={{ padding: "16px 20px" }}>
          <p className="ev-hint" style={{ margin: 0 }}>
            Преземете ги сите податоци што ги чуваме за вашиот локал: настани, парови, гости, резервации и фотографии.
          </p>
          {exportStatus ? <p className="muted" style={{ margin: 0 }}>{exportStatus}</p> : null}
          <button type="button" className="btn btn-ghost" onClick={handleExport} disabled={isExporting}>
            {isExporting ? "Се подготвува..." : "Преземи ги податоците"}
          </button>
        </div>
        <form onSubmit={handleDeleteAccount} className="ev-form" style={{ padding: "0 20px 16px" }}>
          <p className="ev-hint" style={{ margin: 0 }}>
            Бришењето на сметката трајно ги брише локалот, сите настани, гости, резервации, фотографии и најавите на
            вработените. Ова не може да се врати.
          </p>
          <div className="ev-field ev-field-wide">
            <label className="lab-s" htmlFor="settings-delete-confirm">
              За потврда, внесете го името на локалот: <b>{savedVenueName}</b>
            </label>
            <input
              id="settings-delete-confirm"
              className="fld"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              autoComplete="off"
            />
          </div>
          {deleteStatus ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{deleteStatus}</p> : null}
          <button
            type="submit"
            className="btn btn-ghost"
            style={{ color: "var(--bad)" }}
            disabled={!canDeleteAccount || isDeletingAccount}
          >
            <Icon name="trash" size="sm" /> {isDeletingAccount ? "Се брише..." : "Избриши ја сметката"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => handleSignOut("local")}
            disabled={isSigningOut}
            className="btn btn-ghost"
            style={{ color: "var(--bad)" }}
          >
            <Icon name="left" size="sm" /> {isSigningOut ? "Се одјавува..." : "Одјави се"}
          </button>
          <button
            type="button"
            onClick={() => handleSignOut("global")}
            disabled={isSigningOut}
            className="btn btn-ghost"
          >
            Одјави се од сите уреди
          </button>
          <p className="ev-hint" style={{ margin: 0, flexBasis: "100%" }}>
            „Одјави се од сите уреди“ ги прекинува најавите на другите компјутери и телефони (најдоцна за еден час).
          </p>
        </div>
      </section>
    </div>
  );
}
