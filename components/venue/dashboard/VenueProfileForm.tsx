"use client";

import { useState } from "react";
import {
  checkLogoFile,
  removeVenueLogo,
  updateVenueProfile,
  uploadVenueLogo,
  LOGO_TYPE_ERROR,
} from "@/lib/venue/venue-profile";

/** Settings → venue profile (B10): address, phone and the logo used on printed plans and invitations. */
export function VenueProfileForm({
  venueId,
  address: initialAddress,
  phone: initialPhone,
  logoUrl: initialLogoUrl,
}: {
  venueId: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
}) {
  const [address, setAddress] = useState(initialAddress ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [status, setStatus] = useState<string | null>(null);
  const [logoStatus, setLogoStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setSaving(true);
    try {
      await updateVenueProfile(venueId, { address, phone });
      setStatus("Зачувано.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Не успеа зачувувањето. Обидете се повторно.");
    } finally {
      setSaving(false);
    }
  }

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoStatus(null);
    setUploading(true);
    try {
      await checkLogoFile(file);
      setLogoUrl(await uploadVenueLogo(venueId, file));
    } catch (err) {
      setLogoStatus(err instanceof Error ? err.message : LOGO_TYPE_ERROR);
    } finally {
      setUploading(false);
    }
  }

  async function dropLogo() {
    setLogoStatus(null);
    try {
      await removeVenueLogo(venueId);
      setLogoUrl(null);
    } catch (err) {
      setLogoStatus(err instanceof Error ? err.message : "Не успеа отстранувањето на логото.");
    }
  }

  return (
    <form onSubmit={save} className="ev-form">
      <div className="ev-form-grid">
        <div className="ev-field ev-field-wide">
          <label className="lab-s" htmlFor="venue-address">
            Адреса
          </label>
          <input id="venue-address" className="fld" maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="venue-phone">
            Телефон
          </label>
          <input id="venue-phone" className="fld" type="tel" maxLength={50} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="venue-logo">
            Лого
          </label>
          <input id="venue-logo" className="fld" type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} disabled={uploading} />
          <p className="ev-hint">PNG, JPG или WEBP, до 5 MB. Се печати на планот на салата и на поканите.</p>
        </div>
      </div>
      {logoUrl ? (
        <div className="s3-logo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL, shown as uploaded */}
          <img src={logoUrl} alt="Лого на локалот" />
          <button type="button" className="btn btn-ghost" onClick={dropLogo}>
            Отстрани лого
          </button>
        </div>
      ) : null}
      {logoStatus ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{logoStatus}</p> : null}
      <button className="btn btn-gold" type="submit" disabled={saving}>
        {saving ? "Се зачувува..." : "Зачувај профил"}
      </button>
      {status ? <p className="ev-hint">{status}</p> : null}
    </form>
  );
}
