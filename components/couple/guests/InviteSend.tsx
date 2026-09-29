"use client";

import { useEffect, useState } from "react";
import type { Guest, InvitationChannel } from "@/lib/couple/guests";
import { inviteMessage, personalInviteUrl, shareLinks } from "@/lib/couple/invite-share";

/** What a guest's invitation message needs; `slug` is null until the couple makes the invitation. */
export interface ShareContext {
  slug: string | null;
  coupleNames: string;
  eventDate: string;
  venueName: string;
  eventType: string;
  /** Resend is configured, so the app can send the email itself. */
  emailEnabled: boolean;
}

export interface SendActions {
  markSent: (guestIds: string[], channel: InvitationChannel) => Promise<void>;
  emailInvites: (guestIds: string[]) => Promise<void>;
}

/** The site origin, known only after mount (SSR has no window). */
export function useOrigin(): string {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

export function guestLink(share: ShareContext, origin: string, guest: Guest): string {
  return personalInviteUrl(origin, share.slug ?? "", guest.invite_token);
}

function guestMessage(share: ShareContext, origin: string, guest: Guest): string {
  return inviteMessage({
    guestName: guest.full_name,
    coupleNames: share.coupleNames,
    eventDate: share.eventDate,
    venueName: share.venueName,
    eventType: share.eventType,
    link: guestLink(share, origin, guest),
  });
}

const NO_INVITATION = "Прво направете покана во „Покана“, па испратете ја.";

/** A9: send one guest their personal invitation by WhatsApp, Viber, SMS, email or a copied link. */
export function GuestSendButtons({ guest, share, actions }: { guest: Guest; share: ShareContext | undefined; actions: SendActions }) {
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  if (!share?.slug) return <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>{NO_INVITATION}</p>;

  const message = guestMessage(share, origin, guest);
  const links = shareLinks(guest.phone, message);
  const mailto = guest.email
    ? `mailto:${guest.email}?subject=${encodeURIComponent(`Покана: ${share.coupleNames}`)}&body=${encodeURIComponent(message)}`
    : null;

  async function copy() {
    await navigator.clipboard.writeText(guestLink(share!, origin, guest));
    setCopied(true);
    await actions.markSent([guest.id], "link");
  }

  const external = { target: "_blank", rel: "noopener noreferrer", className: "btn btn-ghost" } as const;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <a href={links.whatsapp} {...external} onClick={() => void actions.markSent([guest.id], "whatsapp")}>
        WhatsApp
      </a>
      <a href={links.viber} {...external} onClick={() => void actions.markSent([guest.id], "viber")}>
        Viber
      </a>
      <a href={links.sms} {...external} onClick={() => void actions.markSent([guest.id], "sms")}>
        SMS
      </a>
      {guest.email && share.emailEnabled ? (
        <button type="button" className="btn btn-ghost" onClick={() => void actions.emailInvites([guest.id])}>
          Email
        </button>
      ) : mailto ? (
        <a href={mailto} className="btn btn-ghost" onClick={() => void actions.markSent([guest.id], "email")}>
          Email
        </a>
      ) : null}
      <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
        {copied ? "Копирано ✓" : "Копирај линк"}
      </button>
    </div>
  );
}

/** A9: send to every guest in the current list who has not had the invitation yet. */
export function BulkSendDialog({
  guests,
  share,
  actions,
  onClose,
}: {
  guests: Guest[];
  share: ShareContext | undefined;
  actions: SendActions;
  onClose: () => void;
}) {
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const unsent = guests.filter((g) => g.invitation_sent_at === null);
  const withEmail = unsent.filter((g) => g.email);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyAll() {
    await navigator.clipboard.writeText(unsent.map((g) => `${g.full_name}: ${guestLink(share!, origin, g)}`).join("\n"));
    setCopied(true);
    await actions.markSent(
      unsent.map((g) => g.id),
      "link",
    );
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(20,22,27,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-send-title"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)", width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", borderRadius: "16px 16px 0 0", padding: "18px 20px 24px" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 id="bulk-send-title" className="panel-t" style={{ margin: 0 }}>
            Масовно праќање
          </h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} autoFocus>
            Затвори
          </button>
        </div>
        {!share?.slug ? (
          <p style={{ fontSize: 13.5, color: "var(--muted)" }}>{NO_INVITATION}</p>
        ) : (
          <>
            <p style={{ fontSize: 14, margin: "12px 0" }}>{`${unsent.length} гости без испратена покана`}</p>
            {unsent.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                <button type="button" className="btn btn-gold" onClick={() => void copyAll()}>
                  {copied ? "Копирано ✓" : "Копирај ги сите линкови"}
                </button>
                {share.emailEnabled && withEmail.length > 0 ? (
                  <button type="button" className="btn btn-ghost" onClick={() => void actions.emailInvites(withEmail.map((g) => g.id))}>
                    {`Прати email на сите со адреса (${withEmail.length})`}
                  </button>
                ) : null}
              </div>
            ) : null}
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {unsent.map((g) => (
                <li key={g.id} style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <span style={{ fontWeight: 600 }}>{g.full_name}</span>
                  <GuestSendButtons guest={g} share={share} actions={actions} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
