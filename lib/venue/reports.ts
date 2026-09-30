import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventStatus, EventType } from "./events";
import { listRoomsWithSeatTotals } from "./rooms";

// Venue reports (B9): events per month / type / status, guests, money from
// the finance fields, and fill per hall. Staff cannot read guest lists, so
// "guests" is each event's estimate. Cancelled events count by status only.

export interface ReportFilters {
  from: string; // YYYY-MM-DD, inclusive
  to: string;
  roomId?: string;
}

export interface ReportEvent {
  id: string;
  event_date: string;
  event_type: EventType;
  status: EventStatus;
  guest_count_estimate: number | null;
  total_price: number | null;
  deposit_paid: number | null;
  room_ids: string[];
}

export interface ReportRoom {
  id: string;
  name: string;
  seatTotal: number;
}

export interface ReportData {
  byMonth: { month: string; events: number; guests: number; revenue: number; deposits: number }[];
  byType: { type: EventType; count: number }[];
  byStatus: { status: EventStatus; count: number }[];
  byRoom: { roomId: string; roomName: string; events: number; seatCapacity: number; avgFill: number | null }[];
  totals: { events: number; guests: number; revenue: number; deposits: number };
}

function countBy<K extends string>(items: K[]): { key: K; count: number }[] {
  const map = new Map<K, number>();
  for (const k of items) map.set(k, (map.get(k) ?? 0) + 1);
  return Array.from(map, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function buildReport(events: ReportEvent[], rooms: ReportRoom[], f: ReportFilters): ReportData {
  const inRange = events.filter(
    (e) => e.event_date >= f.from && e.event_date <= f.to && (!f.roomId || e.room_ids.includes(f.roomId)),
  );
  const live = inRange.filter((e) => e.status !== "cancelled");
  const seatsOf = new Map(rooms.map((r) => [r.id, r.seatTotal]));

  const months = new Map<string, ReportData["byMonth"][number]>();
  for (const e of inRange) {
    const month = e.event_date.slice(0, 7);
    const m = months.get(month) ?? { month, events: 0, guests: 0, revenue: 0, deposits: 0 };
    m.events += 1;
    if (e.status !== "cancelled") {
      m.guests += e.guest_count_estimate ?? 0;
      m.revenue += e.total_price ?? 0;
      m.deposits += e.deposit_paid ?? 0;
    }
    months.set(month, m);
  }

  const byRoom = rooms
    .filter((r) => !f.roomId || r.id === f.roomId)
    .map((room) => {
      const here = inRange.filter((e) => e.room_ids.includes(room.id));
      const fills = live
        .filter((e) => e.room_ids.includes(room.id) && e.guest_count_estimate != null)
        .map((e) => {
          const capacity = e.room_ids.reduce((sum, id) => sum + (seatsOf.get(id) ?? 0), 0);
          return capacity > 0 ? e.guest_count_estimate! / capacity : null;
        })
        .filter((v): v is number => v !== null);
      return {
        roomId: room.id,
        roomName: room.name,
        events: here.length,
        seatCapacity: room.seatTotal,
        avgFill: fills.length ? fills.reduce((a, b) => a + b, 0) / fills.length : null,
      };
    });

  return {
    byMonth: Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month)),
    byType: countBy(inRange.map((e) => e.event_type)).map(({ key, count }) => ({ type: key, count })),
    byStatus: countBy(inRange.map((e) => e.status)).map(({ key, count }) => ({ status: key, count })),
    byRoom,
    totals: {
      events: inRange.length,
      guests: live.reduce((s, e) => s + (e.guest_count_estimate ?? 0), 0),
      revenue: live.reduce((s, e) => s + (e.total_price ?? 0), 0),
      deposits: live.reduce((s, e) => s + (e.deposit_paid ?? 0), 0),
    },
  };
}

export async function getReport(client: SupabaseClient, venueId: string, f: ReportFilters): Promise<ReportData> {
  const [{ data, error }, rooms] = await Promise.all([
    client
      .from("events")
      .select("id, event_date, event_type, status, guest_count_estimate, total_price, deposit_paid, event_rooms(room_id)")
      .eq("venue_id", venueId)
      .gte("event_date", f.from)
      .lte("event_date", f.to)
      .order("event_date")
      .limit(5000),
    listRoomsWithSeatTotals(venueId, client),
  ]);
  if (error) throw error;
  const events: ReportEvent[] = (data ?? []).map((e) => ({
    id: e.id,
    event_date: e.event_date,
    event_type: e.event_type as EventType,
    status: e.status as EventStatus,
    guest_count_estimate: e.guest_count_estimate,
    total_price: e.total_price == null ? null : Number(e.total_price),
    deposit_paid: e.deposit_paid == null ? null : Number(e.deposit_paid),
    room_ids: ((e.event_rooms ?? []) as { room_id: string }[]).map((r) => r.room_id),
  }));
  return buildReport(events, rooms.map((r) => ({ id: r.id, name: r.name, seatTotal: r.seatTotal })), f);
}
