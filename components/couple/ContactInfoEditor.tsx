"use client";

import { useState } from "react";

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
      if (!response.ok) throw new Error("Failed to save contact info.");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save contact info.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="panel" style={{ padding: 16 }}>
      <p className="panel-t" style={{ marginBottom: 12 }}>
        Contact info
      </p>
      <div className="ev-form-grid" style={{ marginBottom: 12 }}>
        <div className="ev-field">
          <label className="lab-s">Contact email</label>
          <input type="email" className="fld" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="ev-field">
          <label className="lab-s">Second contact email</label>
          <input type="email" className="fld" value={email2} onChange={(e) => setEmail2(e.target.value)} />
        </div>
        <div className="ev-field">
          <label className="lab-s">Contact phone</label>
          <input className="fld" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, marginBottom: 8 }}>{error}</p> : null}
      <button type="submit" disabled={isSaving} className="btn btn-gold">
        {isSaving ? "Saving..." : "Save"}
      </button>
      {saved ? <span style={{ marginLeft: 10, color: "var(--ok)", fontSize: 13.5 }}>Saved</span> : null}
    </form>
  );
}
