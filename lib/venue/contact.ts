import { createServiceRoleClient } from "@/lib/supabase/service-role";

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
}
