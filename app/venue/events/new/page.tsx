"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { NewEventForm } from "@/components/venue/NewEventForm";
import { Icon } from "@/components/venue/shell/Icon";
import type { Room } from "@/lib/venue/rooms";
import type { MenuTemplate } from "@/lib/venue/menus";

export default function NewEventPage() {
  const router = useRouter();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [menuTemplates, setMenuTemplates] = useState<MenuTemplate[]>([]);
  const [roomTotals, setRoomTotals] = useState<Record<string, { tables: number; seats: number }>>({});
  const [initialRoomIds, setInitialRoomIds] = useState<string[]>([]);
  // The form reads rooms once, when it mounts (room-first step), so it waits for everything.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createBrowserSupabaseClient();
      const vId = await getCurrentVenueId(supabase);
      if (!vId) return;
      setVenueId(vId);

      const { data: roomRows } = await supabase
        .from("rooms")
        .select("id, venue_id, name, width_cm, height_cm, table_types(seats, quantity)")
        .eq("venue_id", vId)
        .order("name");
      const list = roomRows ?? [];
      setRoomTotals(
        Object.fromEntries(
          list.map((r) => {
            const types = (r.table_types ?? []) as { seats: number; quantity: number }[];
            return [r.id, { tables: types.reduce((n, t) => n + t.quantity, 0), seats: types.reduce((n, t) => n + t.seats * t.quantity, 0) }];
          }),
        ),
      );
      setRooms(list.map((r) => ({ id: r.id, venue_id: r.venue_id, name: r.name, width_cm: r.width_cm, height_cm: r.height_cm })));
      // B6: "Нов настан" from a hall's card on the dashboard/calendar arrives with ?room=.
      const preset = new URLSearchParams(window.location.search).get("room");
      if (preset) setInitialRoomIds([preset]);

      const { data: templateRows } = await supabase
        .from("menu_templates")
        .select("id, venue_id, name, description")
        .eq("venue_id", vId);
      setMenuTemplates(templateRows ?? []);
      setLoaded(true);
    }
    load();
  }, []);

  return (
    <div className="wrap">
      <Link className="btn btn-ghost" href="/venue/events" style={{ alignSelf: "flex-start" }}>
        <Icon name="left" size="sm" />
        Назад кон настани
      </Link>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Нов настан</h2>
        </div>
        <div style={{ padding: 20 }}>
          {!venueId || !loaded ? (
            <p className="count">Се вчитува...</p>
          ) : (
            <NewEventForm
              venueId={venueId}
              rooms={rooms}
              roomTotals={roomTotals}
              initialRoomIds={initialRoomIds}
              menuTemplates={menuTemplates}
              onCreated={() => {
                router.refresh();
                router.push("/venue/events");
              }}
            />
          )}
        </div>
      </section>
    </div>
  );
}
