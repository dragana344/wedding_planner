import "server-only";

// Transactional email through Resend's HTTP API (INFRA-006 decision). No SDK:
// one POST. Configured by RESEND_API_KEY and EMAIL_FROM; without them nothing
// is sent and callers carry on (see docs/production/EMAIL.md).

export type OutgoingEmail = { to: string; subject: string; text: string; replyTo?: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Resend responded ${response.status}`);
}
