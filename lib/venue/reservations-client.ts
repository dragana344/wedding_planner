// Browser-side calls to /api/venue/reservations/[id] (0174): status changes
// and the separate hard delete go through the server so each is audited
// with the elevated manager's name, when there is one. No "server-only":
// imported from "use client" components.
import { post } from "@/lib/venue/events-client";
import type { ReservationStatus } from "@/lib/venue/reservations";

export async function setReservationStatusViaApi(id: string, status: ReservationStatus, managerToken: string | null): Promise<void> {
  await post(`/api/venue/reservations/${id}`, "PATCH", { status }, managerToken);
}

export async function deleteReservationViaApi(id: string, managerToken: string | null): Promise<void> {
  await post(`/api/venue/reservations/${id}`, "DELETE", undefined, managerToken);
}
