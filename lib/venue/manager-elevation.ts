import "server-only";
import { randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashSessionToken } from "@/lib/couple/session-hash";

export const MANAGER_ELEVATION_DURATION_MS = 4 * 60 * 60 * 1000;

export type VerifyManagerResult =
  | { managerId: string; managerName: string; isOwner: boolean }
  | { errorCode: "invalid" | "locked" };

export async function verifyVenueManager(venueId: string, name: string, password: string): Promise<VerifyManagerResult> {
  const client = createServiceRoleClient();
  const { data, error } = await client.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: name, p_password: password });
  if (error) throw error;
  const row = data![0] as { manager_id: string | null; manager_name: string | null; is_owner: boolean | null; error_code: "invalid" | "locked" | null };
  if (row.error_code) return { errorCode: row.error_code };
  return { managerId: row.manager_id!, managerName: row.manager_name!, isOwner: row.is_owner! };
}

export async function createManagerElevation(
  venueId: string,
  managerId: string,
  managerName: string,
  isOwner: boolean
): Promise<{ token: string; expiresAt: Date; managerName: string; isOwner: boolean }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MANAGER_ELEVATION_DURATION_MS);
  const client = createServiceRoleClient();
  const { error } = await client.from("venue_manager_elevations").insert({
    token: await hashSessionToken(token),
    venue_id: venueId,
    manager_id: managerId,
    manager_name: managerName,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
  return { token, expiresAt, managerName, isOwner };
}

export async function validateManagerElevation(token: string, venueId: string): Promise<{ managerId: string; managerName: string; isOwner: boolean } | null> {
  const client = createServiceRoleClient();
  const tokenHash = await hashSessionToken(token);
  const { data } = await client
    .from("venue_manager_elevations")
    .select("manager_id, manager_name, venue_id, expires_at, venue_managers(is_owner)")
    .eq("token", tokenHash)
    .maybeSingle();
  if (!data) return null;
  if (data.venue_id !== venueId) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  const managerRow = data.venue_managers as { is_owner: boolean } | { is_owner: boolean }[] | null;
  const isOwner = Array.isArray(managerRow) ? (managerRow[0]?.is_owner ?? false) : (managerRow?.is_owner ?? false);
  return { managerId: data.manager_id, managerName: data.manager_name, isOwner };
}

export async function deleteManagerElevation(token: string): Promise<void> {
  const client = createServiceRoleClient();
  await client.from("venue_manager_elevations").delete().eq("token", await hashSessionToken(token));
}
