import { requireAdmin } from "@/lib/admin/guard";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin({ page: true });
  return <AdminShell>{children}</AdminShell>;
}
