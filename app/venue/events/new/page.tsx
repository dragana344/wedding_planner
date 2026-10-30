"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { NewEventWizard } from "@/components/venue/events/NewEventWizard";
import type { MenuTemplateWithItems } from "@/components/venue/events/EventWizardSteps";
import { Icon } from "@/components/venue/shell/Icon";
import type { Room } from "@/lib/venue/rooms";
import { listMenuTemplatesWithItems } from "@/lib/venue/menus";
import { useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";

export default function NewEventPage() {
  const router = useRouter();
  const { managerName } = useManagerElevation();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [menuTemplates, setMenuTemplates] = useState<MenuTemplateWithItems[]>([]);
  const [initialRoomIds, setInitialRoomIds] = useState<string[]>([]);
  // The form reads rooms once, when it mounts, so it waits for everything.
  const [loaded, setLoaded] = useState(false);
  // A failed load says so (with a retry) instead of "Се вчитува..." forever.
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createBrowserSupabaseClient();
      const vId = await getCurrentVenueId(supabase);
      if (!vId) throw new Error("no venue");

      const { data: roomRows, error: roomsError } = await supabase
        .from("rooms")
        .select("id, venue_id, name, width_cm, height_cm")
        .eq("venue_id", vId)
        .order("name");
      if (roomsError) throw roomsError;
      const templates = await listMenuTemplatesWithItems(vId, supabase);
      if (cancelled) return;

      setVenueId(vId);
      setRooms(roomRows ?? []);
      // B6: "Нов настан" from a hall's card on the dashboard/calendar arrives with ?room=.
      const preset = new URLSearchParams(window.location.search).get("room");
      if (preset) setInitialRoomIds([preset]);
      setMenuTemplates(templates);
      setLoaded(true);
    }
    setLoadError(false);
    load().catch(() => {
      if (!cancelled) setLoadError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div className="wrap">
      <Link className="btn btn-ghost" href="/venue/events" style={{ alignSelf: "flex-start" }}>
        <Icon name="left" size="sm" />
        Назад кон настани
      </Link>

      {!managerName ? (
        <section className="panel">
          <div style={{ padding: 20 }}>
            <p className="muted">Само менаџер или сопственик може да креира настан. Најавете се како менаџер од менито горе десно.</p>
          </div>
        </section>
      ) : loadError ? (
        <section className="panel">
          <div style={{ padding: 20 }}>
            <p role="alert" style={{ color: "var(--bad)", margin: "0 0 12px" }}>
              Салите и менијата не можеа да се вчитаат.
            </p>
            <button type="button" className="btn btn-ghost" onClick={() => setAttempt((n) => n + 1)}>
              Обиди се повторно
            </button>
          </div>
        </section>
      ) : !venueId || !loaded ? (
        <section className="panel">
          <div style={{ padding: 20 }}>
            <p className="count">Се вчитува...</p>
          </div>
        </section>
      ) : (
        <NewEventWizard
          venueId={venueId}
          rooms={rooms}
          initialRoomIds={initialRoomIds}
          menuTemplates={menuTemplates}
          onCreated={() => {
            router.refresh();
            router.push("/venue/events");
          }}
        />
      )}
    </div>
  );
}
