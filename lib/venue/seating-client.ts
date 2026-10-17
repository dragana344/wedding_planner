// Browser-side staff seating actions: reads stay on the RLS-bound client
// (staff may read their own events' layouts), every write goes through
// /api/venue/events/[eventId]/seating with the manager-elevation token so
// the server can independently verify it (spec D2) — the same split as
// lib/venue/events-client.ts. No "server-only": imported from client components.
import type { SeatingActions } from "@/components/venue/dashboard/EventSeatingPage";
import type { EventLayoutElement } from "@/lib/venue/floorplan";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";
import { staffLayoutActions } from "@/lib/venue/floorplan-history";
import { reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";

const MANAGER_TOKEN_HEADER = "x-venue-manager-token";

export type SeatingOp =
  | { op: "initialize"; room_id: string }
  | { op: "add"; element: Record<string, unknown> }
  | { op: "update"; element_id: string; change: Record<string, unknown> }
  | { op: "delete"; element_id: string }
  | { op: "revert"; room_id: string }
  | { op: "undo"; room_id: string }
  | { op: "redo"; room_id: string }
  | { op: "group"; room_id: string; element_ids: string[] }
  | { op: "ungroup"; room_id: string; group_id: string };

async function send<T>(eventId: string, body: SeatingOp, managerToken: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (managerToken) headers[MANAGER_TOKEN_HEADER] = managerToken;
  const response = await fetch(`/api/venue/events/${eventId}/seating`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // A 403 means the server no longer honours this token (expired or
    // revoked): drop the stale "Менаџер: X" badge and gated controls too.
    if (response.status === 403) reportElevationRejected();
    throw new Error(data?.error ?? "Акцијата не успеа.");
  }
  return data as T;
}

/** Staff actions for one event's seating page; `eventId` is the page's event. */
export function venueSeatingClientActions(eventId: string, managerToken: string | null): SeatingActions {
  const reads = staffLayoutActions(resolveSupabaseClient());
  const op = <T>(body: SeatingOp) => send<T>(eventId, body, managerToken);
  const update = (id: string, change: Record<string, unknown>) =>
    op<EventLayoutElement>({ op: "update", element_id: id, change });

  return {
    listFixedElements: reads.listFixedElements,
    listLayoutElements: reads.listLayoutElements,
    // Copying the venue's standard layout into a never-opened room isn't an
    // edit, so the route allows it without elevation — plain staff can view.
    initializeFromStandard: (_eventId, roomId) => op({ op: "initialize", room_id: roomId }),
    addElement: (input) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { event_id, ...element } = input;
      return op({ op: "add", element });
    },
    moveElement: (id, xCm, yCm) => update(id, { type: "position", x_cm: xCm, y_cm: yCm }),
    resizeElement: (id, widthCm, lengthCm) => update(id, { type: "size", width_cm: widthCm, length_cm: lengthCm }),
    rotateElement: (id, rotationDeg) => update(id, { type: "rotation", rotation_deg: rotationDeg }),
    relabelElement: (id, label) => update(id, { type: "label", label }),
    deleteElement: async (id) => {
      await op({ op: "delete", element_id: id });
    },
    revertToStandard: (_eventId, roomId) => op({ op: "revert", room_id: roomId }),
    captureSnapshot: async () => {},
    undo: (_eventId, roomId) => op({ op: "undo", room_id: roomId }),
    redo: (_eventId, roomId) => op({ op: "redo", room_id: roomId }),
    getHistoryState: reads.getHistoryState,
    group: (_eventId, roomId, elementIds) => op({ op: "group", room_id: roomId, element_ids: elementIds }),
    ungroup: (_eventId, roomId, groupId) => op({ op: "ungroup", room_id: roomId, group_id: groupId }),
    getRoomSeating: reads.getRoomSeating,
  };
}
