import QRCode from "qrcode";

// Per-table QR cards (B7). Until Session 2 publishes the guest's personal
// page ("Мојата маса") and Session 4 the album upload, the code opens the
// event's public invitation; only this function changes when they land.
export function tableQrTarget(origin: string, invitationSlug: string | null): string {
  const base = origin.replace(/\/+$/, "");
  return invitationSlug ? `${base}/invite/${encodeURIComponent(invitationSlug)}` : base;
}

/** QR code as an inline SVG string (server-side; no network, no canvas). */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#3a2f1e", light: "#ffffff00" } });
}
