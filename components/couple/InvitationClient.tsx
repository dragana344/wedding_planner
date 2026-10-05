// components/couple/InvitationClient.tsx
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { INVITATION_TEMPLATES } from "@/lib/couple/invitation-templates";
import type { Invitation } from "@/lib/couple/invitations";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatMkDate } from "@/lib/date";

export function InvitationClient({
  initialInvitation,
  coupleNames,
  eventDate,
  allTemplates = true,
}: {
  initialInvitation: Invitation | null;
  coupleNames: string;
  eventDate: string;
  /** The package includes `invitation_all_templates`; else premium designs are locked. */
  allTemplates?: boolean;
}) {
  const [invitation, setInvitation] = useState(initialInvitation);
  const [templateId, setTemplateId] = useState(initialInvitation?.template_id ?? INVITATION_TEMPLATES[0].id);
  const [message, setMessage] = useState(initialInvitation?.message ?? "");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  // Set only after mount — window.location.origin doesn't exist during SSR,
  // so computing it inline would render "" server-side and the real origin
  // client-side, tripping a hydration mismatch on this link's text.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const inviteUrl = invitation ? `${origin}/invite/${invitation.public_slug}` : null;

  useEffect(() => {
    if (!inviteUrl) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(inviteUrl).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [inviteUrl]);

  async function handleGenerate() {
    setError(null);
    setIsSaving(true);
    setJustSaved(false);
    try {
      const saved = await jsonOrThrow(
        await fetch("/api/couple/invitation", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template_id: templateId, message: message || null }),
        })
      );
      setInvitation(saved);
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа генерирањето на поканата.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      setError("Не успеа копирањето на линкот.");
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploadingPhoto(true);
    try {
      // The photo is attached to an existing event_invitations
      // row, so a photo picked before "Generate link" has been clicked would
      // silently vanish — create the row first if it doesn't exist yet.
      let current = invitation;
      if (!current) {
        current = await jsonOrThrow(
          await fetch("/api/couple/invitation", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template_id: templateId, message: message || null }),
          })
        );
        setInvitation(current);
      }
      // SEC-005: straight to Storage with a one-time signed upload (no size
      // limit from our server), then the server checks it is a real image.
      const upload = await jsonOrThrow(await fetch("/api/couple/invitation/photo", { method: "POST" }));
      const { error: uploadError } = await createBrowserSupabaseClient()
        .storage.from("invitation-photos")
        .uploadToSignedUrl(upload.path, upload.token, file, {
          contentType: file.type || "application/octet-stream",
          cacheControl: "31536000",
        });
      if (uploadError) throw new Error("Датотеката не е поддржана слика или е преголема (до 50 MB).");
      const result = await jsonOrThrow(
        await fetch("/api/couple/invitation/photo/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: upload.path }),
        }),
      );
      setInvitation((prev) => (prev ? { ...prev, photo_path: result.photo_path } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа прикачувањето на фотографијата.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <p className="lab-s" style={{ marginBottom: 8 }}>Изберете дизајн</p>
        {/* Inline grid, not the `grid` class: panel.css gives `.vp .grid` a 1010px min-width. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          {INVITATION_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setTemplateId(template.id)}
              aria-pressed={templateId === template.id}
              disabled={template.premium && !allTemplates}
              className="ev"
              style={{
                textAlign: "left",
                cursor: "pointer",
                borderColor: templateId === template.id ? template.accentColor : undefined,
                borderWidth: templateId === template.id ? 2 : 1,
              }}
            >
              <p style={{ fontWeight: 700, margin: 0 }}>{template.name}</p>
              {template.premium ? (
                <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--gold-lo)" }}>
                  {allTemplates ? "Премиум" : "Премиум · не е во вашиот пакет"}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <p className="lab-s" style={{ marginBottom: 4 }}>Преглед</p>
        <p className="font-display text-2xl" style={{ color: (INVITATION_TEMPLATES.find((t) => t.id === templateId) ?? INVITATION_TEMPLATES[0]).accentColor, margin: 0 }}>
          {coupleNames}
        </p>
        <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>{formatMkDate(eventDate)}</p>
        {message ? <p style={{ marginTop: 8, color: "var(--ink-2)", fontSize: 13.5 }}>{message}</p> : null}
      </div>

      <textarea className="fld" placeholder="Порака (опционално)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={3} />

      <div>
        <label htmlFor="invitation-photo" className="lab-s">
          Фотографија (опционално)
        </label>
        <input id="invitation-photo" aria-label="Фотографија (опционално)" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={handlePhotoChange} disabled={isUploadingPhoto} />
        {isUploadingPhoto ? <p style={{ color: "var(--muted)", fontSize: 13.5 }}>Се прикачува...</p> : null}
        {invitation?.photo_path ? <p style={{ color: "var(--muted)", fontSize: 13.5 }}>Фотографијата е прикачена.</p> : null}
      </div>

      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
      {justSaved && !error ? (
        <p role="status" style={{ color: "var(--ok)", fontSize: 13.5, margin: 0 }}>
          Поканата е зачувана.
        </p>
      ) : null}
      <button type="button" onClick={handleGenerate} disabled={isSaving} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
        {isSaving ? "Се зачувува..." : invitation ? "Зачувај промени" : "Генерирај линк"}
      </button>

      {invitation ? (
        <div className="ev">
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>Споделете го овој линк:</p>
          <p style={{ wordBreak: "break-all", fontFamily: "var(--data)", fontSize: 13.5 }}>{inviteUrl}</p>
          <button type="button" onClick={handleCopyLink} className="btn btn-ghost">
            {isCopied ? "Копирано!" : "Копирај линк"}
          </button>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL; next/image has nothing to optimise
            <img src={qrDataUrl} alt="QR код на поканата" style={{ marginTop: 8, height: 160, width: 160 }} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
