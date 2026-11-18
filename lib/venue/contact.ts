import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { emailConfigured, sendEmail } from "@/lib/email";
import { errorFields, log } from "@/lib/log";

export interface ContactMessageInput {
  name: string;
  email: string;
  message: string;
}

export async function submitContactMessage(input: ContactMessageInput): Promise<void> {
  const client = createServiceRoleClient();
  const { error } = await client.from("contact_submissions").insert({
    name: input.name,
    email: input.email,
    message: input.message,
  });
  if (error) throw error;
  await notifyTeam(input, `Нова порака од контакт формата: ${input.name}`, "контакт форма");
}

export interface DemoRequestInput {
  name: string;
  venueName: string;
  city: string;
  phone: string;
  email: string;
  message?: string;
}

/** The demo details as the admin reads them in the inbox (kept in `message`, migration 0173). */
export function demoRequestText(input: DemoRequestInput): string {
  const lines = [`Локал: ${input.venueName.trim()}`, `Град: ${input.city.trim()}`, `Телефон: ${input.phone.trim()}`].join("\n");
  const note = input.message?.trim();
  return note ? `${lines}\n\n${note}` : lines;
}

/** /signup's "request a demo" form: a contact_submissions row of kind 'demo'. */
export async function submitDemoRequest(input: DemoRequestInput): Promise<void> {
  const row = { name: input.name.trim(), email: input.email.trim(), message: demoRequestText(input) };
  const { error } = await createServiceRoleClient()
    .from("contact_submissions")
    .insert({ ...row, kind: "demo" });
  if (error) throw error;
  await notifyTeam(row, `Ново барање за демо: ${input.venueName.trim()}`, "барање за демо");
}

/**
 * OBS-005: forward the stored message to the team inbox. Best effort: the
 * submission is already saved, so a mail failure is logged, never surfaced.
 */
async function notifyTeam(input: ContactMessageInput, subject: string, source: string): Promise<void> {
  const to = process.env.CONTACT_NOTIFY_EMAIL;
  if (!to || !emailConfigured()) return;
  try {
    await sendEmail({
      to,
      replyTo: input.email,
      subject,
      text: `Име: ${input.name}\nЕ-пошта: ${input.email}\n\n${input.message}\n\n— Каде си? ${source}`,
    });
  } catch (err) {
    log("warn", "contact_notification_failed", errorFields(err));
  }
}
