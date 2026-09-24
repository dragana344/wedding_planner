"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import { EventSeatingPage } from "./EventSeatingPage";
import { listFixedElements, listEventLayoutElements, type FixedElement, type EventLayoutElement } from "@/lib/venue/floorplan";
import { listTableTypes, type Room, type TableType } from "@/lib/venue/rooms";

/**
 * Full-size overlay for editing one room's seating for an event, opened from
 * the event modal instead of navigating to /venue/events/[id]/seating/[room].
 * Stacks above the (smaller) event-edit modal so staff can return to it after
 * closing this, and gives the floor plan the space it actually needs — the
 * event modal is capped at 640px, nowhere near enough to work a real room
 * layout at scale.
 */
export function EventSeatingOverlay({
  eventId,
  eventName,
  room,
  onClose,
}: {
  eventId: string;
  eventName: string;
  room: Room;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    fixedElements: FixedElement[];
    layoutElements: EventLayoutElement[];
    tableTypes: TableType[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listFixedElements(room.id), listEventLayoutElements(eventId, room.id), listTableTypes(room.id)])
      .then(([fixedElements, layoutElements, tableTypes]) => {
        if (!cancelled) setData({ fixedElements, layoutElements, tableTypes });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Не успеа вчитувањето на распоредот на седење.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, room.id]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="seating-overlay-backdrop" onClick={onClose}>
      <div className="seating-overlay-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            {room.name} — {eventName}
          </h2>
          <button onClick={onClose} aria-label="Затвори" className="modal-close">
            <Icon name="x" size="sm" />
          </button>
        </div>
        <div className="seating-overlay-body">
          {error ? (
            <p style={{ color: "var(--bad)", padding: 20 }}>{error}</p>
          ) : !data ? (
            <p className="ev-hint" style={{ padding: 20 }}>
              Се вчитува распоредот...
            </p>
          ) : (
            <EventSeatingPage
              eventId={eventId}
              eventName={eventName}
              room={room}
              initialFixedElements={data.fixedElements}
              initialLayoutElements={data.layoutElements}
              initialTableTypes={data.tableTypes}
              onBack={onClose}
              backLabel="← Затвори"
            />
          )}
        </div>
      </div>
    </div>
  );
}
