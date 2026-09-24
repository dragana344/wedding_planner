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

  useEffect(() => {
    async function load() {
      const supabase = createBrowserSupabaseClient();
      const vId = await getCurrentVenueId(supabase);
      if (!vId) return;
      setVenueId(vId);

      const { data: roomRows } = await supabase
        .from("rooms")
        .select("id, venue_id, name, width_cm, height_cm")
        .eq("venue_id", vId);
      setRooms(roomRows ?? []);

      const { data: templateRows } = await supabase
        .from("menu_templates")
        .select("id, venue_id, name, description")
        .eq("venue_id", vId);
      setMenuTemplates(templateRows ?? []);
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
          {!venueId ? (
            <p className="count">Се вчитува...</p>
          ) : (
            <NewEventForm
              venueId={venueId}
              rooms={rooms}
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
