"use client";

import { useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";

export function ContactInfoEditor({
  contactEmail,
  contactEmail2,
  contactPhone,
}: {
  contactEmail: string | null;
  contactEmail2: string | null;
  contactPhone: string | null;
}) {
  const [email, setEmail] = useState(contactEmail ?? "");
  const [email2, setEmail2] = useState(contactEmail2 ?? "");
  const [phone, setPhone] = useState(contactPhone ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setIsSaving(true);
    try {
      const response = await fetch("/api/couple/contact-info", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_email: email.trim() || null,
          contact_email_2: email2.trim() || null,
          contact_phone: phone.trim() || null,
        }),
      });
      if (!response.ok) throw new Error("Не успеа зачувувањето на контакт информациите.");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на контакт информациите.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="panel" style={{ padding: 16 }}>
      <p className="panel-t" style={{ marginBottom: 12 }}>
        <Icon name="call" size="sm" /> Контакт информации
      </p>
      <div className="ev-form-grid" style={{ marginBottom: 12 }}>
        <div className="ev-field">
          <label className="lab-s" htmlFor="contact-email">Е-пошта за контакт</label>
          <input id="contact-email" type="email" className="fld" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="contact-email-2">Втора е-пошта за контакт</label>
          <input id="contact-email-2" type="email" className="fld" value={email2} onChange={(e) => setEmail2(e.target.value)} />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="contact-phone">Телефон за контакт</label>
          <input id="contact-phone" className="fld" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, marginBottom: 8 }}>{error}</p> : null}
      <button type="submit" disabled={isSaving} className="btn btn-gold">
        {isSaving ? "Се зачувува..." : "Зачувај"}
      </button>
      {saved ? <span style={{ marginLeft: 10, color: "var(--ok)", fontSize: 13.5 }}>Зачувано</span> : null}
    </form>
  );
}
