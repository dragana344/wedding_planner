import { AdminLogin } from "@/components/admin/AdminLogin";
import { adminMfaRequired } from "@/lib/admin/mfa-policy";

// Read per request, so flipping ADMIN_MFA_REQUIRED needs no rebuild.
export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return <AdminLogin mfaRequired={adminMfaRequired()} />;
}
