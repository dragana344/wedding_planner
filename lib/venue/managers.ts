import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ManagerListEntry = { id: string; name: string; isOwner: boolean; createdAt: string };

export async function listManagers(venueId: string): Promise<ManagerListEntry[]> {
  const { data, error } = await createServiceRoleClient()
    .from("venue_managers")
    .select("id, name, is_owner, created_at")
    .eq("venue_id", venueId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((m) => ({ id: m.id, name: m.name, isOwner: m.is_owner, createdAt: m.created_at }));
}

export async function addManager(venueId: string, name: string, password: string): Promise<{ id: string }> {
  const { data, error } = await createServiceRoleClient().rpc("create_venue_manager", {
    p_venue_id: venueId, p_name: name, p_password: password, p_is_owner: false,
  });
  if (error) throw error;
  return { id: data as string };
}

/**
 * One atomic DELETE, scoped by `is_owner = false` as part of the WHERE
 * clause itself — so the owner can never be deleted by this function no
 * matter what, rather than relying on a separate lookup-then-delete whose
 * lookup could fail open (final review finding: the previous version read
 * `manager?.is_owner` from a query with no error check — a failed or
 * malformed read came back `undefined`, which passed the `if (manager?.
 * is_owner)` check and let the delete through). A follow-up read is only
 * for the error message, never for the authorization decision.
 */
export async function removeManager(venueId: string, managerId: string): Promise<void> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("venue_managers")
    .delete()
    .eq("id", managerId)
    .eq("venue_id", venueId)
    .eq("is_owner", false)
    .select("id");
  if (error) throw error;
  if (data && data.length > 0) return;

  const { data: existing } = await client.from("venue_managers").select("is_owner").eq("id", managerId).eq("venue_id", venueId).maybeSingle();
  if (existing?.is_owner) throw new Error("Не можете да се отстраните себеси.");
  throw new Error("Менаџерот не е пронајден.");
}

export async function changeManagerPassword(managerId: string, newPassword: string): Promise<void> {
  const { error } = await createServiceRoleClient().rpc("change_venue_manager_password", { p_manager_id: managerId, p_new_password: newPassword });
  if (error) throw error;
}

/**
 * Flags that support reset this manager's password, so they get a one-time
 * notice on next elevation (security review item #4). Called only from the
 * admin-initiated reset path — never from a self-service change, since the
 * whole point is to surface resets the manager didn't themselves perform.
 */
export async function markAdminPasswordReset(managerId: string): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from("venue_managers")
    .update({ password_reset_notice_at: new Date().toISOString() })
    .eq("id", managerId);
  if (error) throw error;
}

export async function getPasswordResetNoticeAt(managerId: string): Promise<string | null> {
  const { data, error } = await createServiceRoleClient()
    .from("venue_managers")
    .select("password_reset_notice_at")
    .eq("id", managerId)
    .maybeSingle();
  if (error) throw error;
  return data?.password_reset_notice_at ?? null;
}

/** Acknowledges the notice so it never shows again for this manager. */
export async function clearPasswordResetNotice(managerId: string): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from("venue_managers")
    .update({ password_reset_notice_at: null })
    .eq("id", managerId);
  if (error) throw error;
}
