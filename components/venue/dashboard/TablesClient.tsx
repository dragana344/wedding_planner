"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { SpaceCard } from "./SpaceCard";
import { AddRoomForm } from "./AddRoomForm";
import { Icon } from "@/components/venue/shell/Icon";
import { listRoomsWithSeatTotals, type RoomWithSeatTotal } from "@/lib/venue/rooms";

export function TablesClient({
  venueId,
  initialRooms,
}: {
  venueId: string;
  initialRooms: RoomWithSeatTotal[];
}) {
  const [rooms, setRooms] = useState(initialRooms);
  const [showAdd, setShowAdd] = useState(false);

  async function refresh() {
    setRooms(await listRoomsWithSeatTotals(venueId));
    setShowAdd(false);
  }

  const totalSeats = rooms.reduce((sum, r) => sum + r.seatTotal, 0);

  return (
    <div className="wrap">
      <div className="actions">
        <button className="btn btn-gold" type="button" onClick={() => setShowAdd(true)}>
          <Icon name="plus" />
          ДОДАДИ ПРОСТОРИЈА
        </button>
      </div>

      <section className="tiles" aria-label="Преглед" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
        <div className="tile">
          <span className="badge"><Icon name="pin" size="lg" /></span>
          <div>
            <div className="num">{rooms.length}</div>
            <div className="lab">Простории<span>сали и тераси</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="seats" size="lg" /></span>
          <div>
            <div className="num">{totalSeats}</div>
            <div className="lab">Вкупно места<span>во сите простории</span></div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Простории и инвентар на маси</h2>
        </div>
        {rooms.length === 0 ? (
          <div className="empty">
            <b>Нема простории</b>
            Додадете просторија за да почнете со планирање на распоредот на масите.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 14,
              padding: 16,
            }}
          >
            {rooms.map((room) => (
              <SpaceCard key={room.id} room={room} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>

      {showAdd ? (
        <Modal title="Нова просторија" onClose={() => setShowAdd(false)}>
          <AddRoomForm venueId={venueId} onSaved={refresh} />
        </Modal>
      ) : null}
    </div>
  );
}
