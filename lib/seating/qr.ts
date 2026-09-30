import QRCode from "qrcode";

// Per-table QR cards (B7): the event's invitation, opened at Session 2's
// "Каде седам?" seat lookup (#kade-sedam) — a guest at the table finds their
// seat, the programme and the rest. The album has its own QR (Session 4, C4).
export const SEAT_LOOKUP_ANCHOR = "kade-sedam";

export function tableQrTarget(origin: string, invitationSlug: string | null): string {
  const base = origin.replace(/\/+$/, "");
  return invitationSlug ? `${base}/invite/${encodeURIComponent(invitationSlug)}#${SEAT_LOOKUP_ANCHOR}` : base;
}

/** QR code as an inline SVG string (server-side; no network, no canvas). */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#3a2f1e", light: "#ffffff00" } });
}
