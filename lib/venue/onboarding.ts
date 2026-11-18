import "server-only";
import { createClient, type User } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { LEGAL_VERSION } from "@/lib/legal/facts";
import { recordTermsAcceptance } from "@/lib/venue/provisioning";

// First login of a venue the admin opened (venueActionCore.create), checked
// by app/venue/layout.tsx before the panel is shown:
//   1. "password": the admin knows the generated sign-in password, so the
//      owner picks their own first (app_metadata.must_change_password).
//   2. "terms": the venue has never accepted the Terms (incl. the DPA); the
//      owner accepts them with the owner's manager password (a venue with no
//      owner login: with the venue's own sign-in password).
// After the venue's first-ever acceptance the panel opens with the
// onboarding tour (/venue?tour=1).
//
// A newer LEGAL_VERSION than the one the venue accepted never blocks the
// panel, so staff keep working: the layout shows a banner and the owner
// accepts at /venue/terms (termsUpdatePending).

export type OnboardingStep = "password" | "terms" | null;

/** Set by the admin's "Нов локал"; app_metadata is writable only with the service role. */
export function mustChangePassword(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.must_change_password === true;
}

export function termsAccepted(termsVersion: string | null | undefined): boolean {
  return termsVersion === LEGAL_VERSION;
}

/** The venue accepted an older version of the Terms: a banner, not a blocking screen. */
export function termsUpdatePending(termsVersion: string | null | undefined): boolean {
  return termsVersion != null && !termsAccepted(termsVersion);
}

export function onboardingStep(user: Pick<User, "app_metadata"> | null | undefined, termsVersion: string | null | undefined): OnboardingStep {
  if (mustChangePassword(user)) return "password";
  if (termsVersion == null) return "terms";
  return null;
}

/**
 * Checks the venue's own sign-in password — how a venue with no owner
 * manager login accepts the Terms. A throwaway client that keeps no
 * session; the session the check opens is signed out again (only that one).
 */
export async function verifyAccountPassword(email: string, password: string): Promise<boolean> {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return false;
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return true;
}

/** Clears the first-login flag once the owner has set their own password. */
export async function clearMustChangePassword(userId: string): Promise<void> {
  const { error } = await createServiceRoleClient().auth.admin.updateUserById(userId, { app_metadata: { must_change_password: false } });
  if (error) throw error;
}

/** The owner's manager name: the terms screen asks only for the owner's password. */
export async function venueOwnerName(venueId: string): Promise<string | null> {
  const { data, error } = await createServiceRoleClient()
    .from("venue_managers")
    .select("name")
    .eq("venue_id", venueId)
    .eq("is_owner", true)
    .maybeSingle<{ name: string }>();
  if (error) throw error;
  return data?.name ?? null;
}

/**
 * Records that the venue accepted the current Terms (idempotent: a venue
 * that already accepted this version keeps its timestamp). `firstAcceptance`
 * is true when the venue had never accepted any version (a brand-new venue:
 * the caller starts the onboarding tour).
 */
export async function acceptVenueTerms(venueId: string): Promise<{ firstAcceptance: boolean }> {
  const { data: before, error } = await createServiceRoleClient()
    .from("venues")
    .select("terms_version")
    .eq("id", venueId)
    .single<{ terms_version: string | null }>();
  if (error) throw error;
  await recordTermsAcceptance(venueId, LEGAL_VERSION);
  return { firstAcceptance: before.terms_version === null };
}
