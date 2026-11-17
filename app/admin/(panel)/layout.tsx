import { requireAdmin } from "@/lib/admin/guard";
import { getAdminBadgeCounts } from "@/lib/admin/queries";
import { AdminShell } from "@/components/admin/AdminShell";
import "../mobile-admin.css";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdmin({ page: true });
  // A failed count must never take the whole panel down: no badges instead.
  const badges = await getAdminBadgeCounts(ctx.adminUserId).catch(() => undefined);
  return <AdminShell badges={badges}>{children}</AdminShell>;
}
