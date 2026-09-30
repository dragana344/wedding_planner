import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MfaSettings } from "@/components/venue/dashboard/MfaSettings";

// Mandatory enrolment step (spec §3.2): an admin who just signed in with no
// verified TOTP factor lands here instead of the panel. MfaSettings is the
// same start/verify/disable panel the venue dashboard uses; it needs no venue
// context, only the signed-in aal1 session, so it works standalone here too.
//
// This is deliberately NOT requireAdmin({ page: true }): that gate demands
// aal2, which is exactly what an admin without a verified factor can never
// reach. Here we only need a signed-in platform_admin at any assurance level
// (aal1 included) — finishing enrolment is what makes aal2 possible.
export default async function AdminMfaEnrolPage() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.app_metadata?.role !== "platform_admin") {
    redirect("/admin/login");
  }

  return (
    <div className="vp" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <p className="muted">
          Двофакторската автентикација е задолжителна за админ пристап. Вклучете ја, па најавете се повторно.
        </p>
        <MfaSettings />
        <p style={{ marginTop: 16 }}>
          <a className="btn btn-ghost" href="/admin/login">
            Кон најава
          </a>
        </p>
      </div>
    </div>
  );
}
