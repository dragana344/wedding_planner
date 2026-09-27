"use client";

import type { SeatingActions } from "@/components/venue/dashboard/EventSeatingPage";
import type { EventLayoutElementInput } from "@/lib/venue/floorplan";

async function jsonOrThrow(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Барањето не успеа.");
  return body;
}

async function fetchElements(roomId: string) {
  const response = await fetch(`/api/couple/seating/elements?room_id=${roomId}`);
  return jsonOrThrow(response) as Promise<{ fixedElements: unknown[]; layoutElements: unknown[] }>;
}

export const coupleSeatingClientActions: SeatingActions = {
  listFixedElements: async (roomId) => (await fetchElements(roomId)).fixedElements as never,
  listLayoutElements: async (_eventId, roomId) => (await fetchElements(roomId)).layoutElements as never,
  initializeFromStandard: async (_eventId, roomId) => (await fetchElements(roomId)).layoutElements as never,
  addElement: (input: EventLayoutElementInput) =>
    fetch("/api/couple/seating/elements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(jsonOrThrow),
  moveElement: (id, xCm, yCm) =>
    fetch(`/api/couple/seating/elements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "position", x_cm: xCm, y_cm: yCm }),
    }).then(jsonOrThrow),
  resizeElement: (id, widthCm, lengthCm) =>
    fetch(`/api/couple/seating/elements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "size", width_cm: widthCm, length_cm: lengthCm }),
    }).then(jsonOrThrow),
  rotateElement: (id, rotationDeg) =>
    fetch(`/api/couple/seating/elements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "rotation", rotation_deg: rotationDeg }),
    }).then(jsonOrThrow),
  deleteElement: (id) => fetch(`/api/couple/seating/elements/${id}`, { method: "DELETE" }).then(jsonOrThrow),
  revertToStandard: (_eventId, roomId) =>
    fetch("/api/couple/seating/revert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId }),
    }).then(jsonOrThrow),
  captureSnapshot: async () => {
    // Never actually invoked: the couple seating page passes skipInitialization
    // to EventSeatingPage, so its mount effect never calls this. Implemented
    // as a no-op only to satisfy the SeatingActions interface completely.
  },
  undo: (_eventId, roomId) =>
    fetch("/api/couple/seating/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId }),
    }).then(jsonOrThrow),
  getConfirmedAt: async (_eventId, roomId) => {
    const { confirmedAt } = await jsonOrThrow(await fetch(`/api/couple/seating/confirm?room_id=${roomId}`));
    return confirmedAt as string | null;
  },
  confirm: (_eventId, roomId) =>
    fetch("/api/couple/seating/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId }),
    }).then(jsonOrThrow),
  unconfirm: (_eventId, roomId) =>
    fetch(`/api/couple/seating/confirm?room_id=${roomId}`, { method: "DELETE" }).then(jsonOrThrow),
};
