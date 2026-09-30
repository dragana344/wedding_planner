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
  await notifyTeam(input);
}

/**
 * OBS-005: forward the stored message to the team inbox. Best effort: the
 * submission is already saved, so a mail failure is logged, never surfaced.
 */
async function notifyTeam(input: ContactMessageInput): Promise<void> {
  const to = process.env.CONTACT_NOTIFY_EMAIL;
  if (!to || !emailConfigured()) return;
  try {
    await sendEmail({
      to,
      replyTo: input.email,
      subject: `Нова порака од контакт формата: ${input.name}`,
      text: `Име: ${input.name}\nЕ-пошта: ${input.email}\n\n${input.message}\n\n— КАДЕ СУМ? контакт форма`,
    });
  } catch (err) {
    log("warn", "contact_notification_failed", errorFields(err));
  }
}
