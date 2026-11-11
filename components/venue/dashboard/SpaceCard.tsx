"use client";

import Link from "next/link";
import type { RoomWithSeatTotal } from "@/lib/venue/rooms";

export function SpaceCard({ room }: { room: RoomWithSeatTotal }) {
  return (
    <Link href={`/venue/rooms/${room.id}/floor-plan`} className="menu-package-card">
      <b>{room.name}</b>
      <span className="muted">
        {room.tableTypeCount} {room.tableTypeCount === 1 ? "вид маса" : "видови маси"} · {room.seatTotal} места
      </span>
    </Link>
  );
}
