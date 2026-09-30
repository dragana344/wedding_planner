// Marks one Supabase Auth user as the platform admin (spec §3.2).
//   node --env-file=.env.local scripts/make-admin.mjs owner@example.com
// Creates the user (with a password-reset email) if missing. Refuses venue staff.
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !url || !key) {
  console.error("Usage: node --env-file=<env> scripts/make-admin.mjs <email>");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 1000) break;
}

if (user) {
  // Fail closed: if this check errors we do not know whether the user is
  // staff, so we must not proceed to grant platform_admin.
  const { data: staff, error: staffError } = await admin.from("venue_staff").select("venue_id").eq("user_id", user.id);
  if (staffError) throw staffError;
  if (staff?.length) {
    console.error("This user is venue staff; an admin must be a separate account.");
    process.exit(1);
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: "platform_admin" },
  });
  if (error) throw error;
  console.log(`${email} is now the platform admin.`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: "platform_admin" },
  });
  if (error) throw error;
  // The link lands on this site's /reset-password when NEXT_PUBLIC_SITE_URL is
  // set; otherwise Supabase's own Site URL decides (as before).
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const { error: resetError } = await admin.auth.resetPasswordForEmail(email, site ? { redirectTo: `${site}/reset-password` } : undefined);
  if (resetError) {
    console.error(`Created ${email} (${data.user.id}) as platform admin, but the password-reset email failed to send: ${resetError.message}`);
    process.exit(1);
  }
  console.log(`Created ${email} (${data.user.id}) as platform admin; a password link was emailed.`);
}
console.log("Next: sign in at admin.<domain>/login and enable two-factor authentication.");
