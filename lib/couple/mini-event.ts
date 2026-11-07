// Project B §3: a mini-event never gets a seating editor — just this
// read-only summary of which of the room's tables staff has assigned so
// far ("Вашите маси: Маса 3, Маса 5"), shown on the couple's home page.
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getReservationForEvent } from "@/lib/venue/reservations";
import { listRoomLayoutElements, numberTables } from "@/lib/venue/floorplan";

export interface MiniEventTables {
  roomName: string;
  /** "Маса N" labels, in table-number order; empty while staff hasn't assigned any yet. */
  tableLabels: string[];
}

export async function getMiniEventTables(eventId: string): Promise<MiniEventTables | null> {
  const client = createServiceRoleClient();
  const reservation = await getReservationForEvent(eventId, client);
  if (!reservation) return null;

  const [{ data: room }, elements] = await Promise.all([
    client.from("rooms").select("name").eq("id", reservation.room_id).single(),
    listRoomLayoutElements(reservation.room_id, client),
  ]);

  const numbers = numberTables(elements);
  const tableLabels = reservation.table_ids
    .map((id) => numbers.get(id))
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b)
    .map((n) => `Маса ${n}`);

  return { roomName: room?.name ?? "", tableLabels };
}
