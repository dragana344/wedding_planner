// Two-factor is required for every admin session (spec §3.3) unless the owner
// turns it off with ADMIN_MFA_REQUIRED=false (owner decision, 5 Oct 2026).
// With it off the admin panel is protected by the password alone, so this
// should be back on before the panel is reachable on a public domain.
export function adminMfaRequired(): boolean {
  return process.env.ADMIN_MFA_REQUIRED !== "false";
}
