"use client";

import { internationalPhone } from "@/lib/couple/invite-share";

/**
 * Viber/WhatsApp quick-contact links for a phone number, the same pattern
 * already used for sending a guest their invitation (InviteSend.tsx). Renders
 * nothing without a phone number usable as an international one.
 */
export function PhoneQuickContact({ phone, compact = false }: { phone: string | null; compact?: boolean }) {
  const intl = internationalPhone(phone);
  if (!intl) return null;
  const style = compact ? { padding: "2px 8px", fontSize: 12.5 } : undefined;
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <a href={`https://wa.me/${intl}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={style}>
        WhatsApp
      </a>
      <a href="viber://forward" target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={style}>
        Viber
      </a>
    </span>
  );
}
