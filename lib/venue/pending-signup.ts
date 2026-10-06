import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Opens the caller's venue. Idempotent on the server (see lib/venue/provisioning.ts). */
export function provisionVenue(venueName: string): Promise<Response> {
  return fetch("/api/venue/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ venue_name: venueName }),
  });
}

/**
 * With "Confirm email" on, signUp returns no session, so /signup cannot open
 * the venue itself: it leaves the venue name in the user's metadata instead.
 * This finishes the job on the first sign-in after the email is confirmed.
 *
 * Returns true when it just opened the venue (the caller then starts the
 * onboarding tour), false when there was nothing to do.
 */
export async function finishPendingSignup(supabase: SupabaseClient, user: User | null | undefined): Promise<boolean> {
  const venueName = user?.user_metadata?.venue_name;
  if (!user || typeof venueName !== "string" || !venueName.trim()) return false;

  const { data: staffRow, error } = await supabase.from("venue_staff").select("venue_id").eq("user_id", user.id).maybeSingle();
  if (error || staffRow) return false;

  const response = await provisionVenue(venueName);
  return response.ok;
}
