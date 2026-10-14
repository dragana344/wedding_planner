"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Modal } from "./Modal";
import { SpaceCard } from "./SpaceCard";
import { AddRoomForm } from "./AddRoomForm";
import { Icon } from "@/components/venue/shell/Icon";
import { listRoomsWithSeatTotals, type RoomWithSeatTotal } from "@/lib/venue/rooms";

/** Reads ?addRoom=1 (e.g. from the onboarding tour's CTA) and opens the add-
 * room modal once, then strips the param. Isolated behind Suspense per
 * Next.js's useSearchParams rule, same as OnboardingTour. */
function AutoOpenAddRoom({ onOpen }: { onOpen: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("addRoom") === "1") {
      onOpen();
      router.replace("/venue/tables");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

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
      <Suspense fallback={null}>
        <AutoOpenAddRoom onOpen={() => setShowAdd(true)} />
      </Suspense>
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
