"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/venue/shell/Icon";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { updateVenueName } from "@/lib/venue/venue-profile";
import { setLayoutLockPassword } from "@/lib/venue/floorplan";

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

  async function handleSaveVenueName(e: React.FormEvent) {
    e.preventDefault();
    setVenueNameStatus(null);
    setIsSavingVenueName(true);
    try {
      await updateVenueName(venueId, venueName);
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

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
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
        <div style={{ padding: "16px 20px" }}>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="btn btn-ghost"
            style={{ color: "var(--bad)" }}
          >
            <Icon name="left" size="sm" /> {isSigningOut ? "Се одјавува..." : "Одјави се"}
          </button>
        </div>
      </section>
    </div>
  );
}
