import { describe, it, expect } from "vitest";
import { peakConcurrentGuests } from "@/lib/venue/occupancy";
import type { EventDetail } from "@/lib/venue/events";

function ev(partial: Partial<EventDetail>): EventDetail {
  return {
    id: Math.random().toString(36).slice(2),
    couple_names: "Test",
    event_date: "2026-09-04",
    start_time: null,
    end_time: null,
    status: "confirmed",
    event_type: "wedding",
    guest_count_estimate: null,
    menu_template_id: null,
    customMenuItems: [],
    room_ids: [],
    hasShowcasePhotos: false,
    seatedCount: 0,
    contact_email: null,
    contact_email_2: null,
    contact_phone: null,
    total_price: null,
    deposit_paid: null,
    ...partial,
  };
}

describe("peakConcurrentGuests", () => {
  it("returns 0 for no events", () => {
    expect(peakConcurrentGuests([])).toBe(0);
  });

  it("does not sum events that never overlap", () => {
    const events = [
      ev({ start_time: "11:00", end_time: "15:00", guest_count_estimate: 80 }),
      ev({ start_time: "19:00", end_time: "23:00", guest_count_estimate: 70 }),
    ];
    // Naive summing would give 150; they never share a moment.
    expect(peakConcurrentGuests(events)).toBe(80);
  });

  it("sums events that do overlap", () => {
    const events = [
      ev({ start_time: "11:00", end_time: "15:00", guest_count_estimate: 80 }),
      ev({ start_time: "14:00", end_time: "18:00", guest_count_estimate: 40 }),
    ];
    expect(peakConcurrentGuests(events)).toBe(120);
  });

  it("treats an event ending exactly when another starts as non-overlapping", () => {
    const events = [
      ev({ start_time: "11:00", end_time: "15:00", guest_count_estimate: 80 }),
      ev({ start_time: "15:00", end_time: "19:00", guest_count_estimate: 40 }),
    ];
    expect(peakConcurrentGuests(events)).toBe(80);
  });

  it("handles events running past midnight", () => {
    const events = [
      ev({ start_time: "20:00", end_time: "02:00", guest_count_estimate: 150 }),
      ev({ start_time: "21:00", end_time: "23:00", guest_count_estimate: 30 }),
    ];
    expect(peakConcurrentGuests(events)).toBe(180);
  });

  it("ignores cancelled events", () => {
    const events = [
      ev({ start_time: "11:00", end_time: "15:00", guest_count_estimate: 80 }),
      ev({
        start_time: "11:00",
        end_time: "15:00",
        guest_count_estimate: 500,
        status: "cancelled",
      }),
    ];
    expect(peakConcurrentGuests(events)).toBe(80);
  });

  it("counts events with no start time as always present", () => {
    const events = [
      ev({ start_time: "11:00", end_time: "15:00", guest_count_estimate: 80 }),
      ev({ guest_count_estimate: 20 }),
    ];
    expect(peakConcurrentGuests(events)).toBe(100);
  });

  it("assumes a nominal block when only a start time is known", () => {
    const events = [
      ev({ start_time: "11:00", guest_count_estimate: 80 }),
      ev({ start_time: "12:00", end_time: "13:00", guest_count_estimate: 40 }),
    ];
    expect(peakConcurrentGuests(events)).toBe(120);
  });

  it("finds the peak across three staggered events", () => {
    const events = [
      ev({ start_time: "10:00", end_time: "14:00", guest_count_estimate: 50 }),
      ev({ start_time: "12:00", end_time: "16:00", guest_count_estimate: 60 }),
      ev({ start_time: "13:00", end_time: "13:30", guest_count_estimate: 25 }),
    ];
    // 13:00–13:30 has all three present.
    expect(peakConcurrentGuests(events)).toBe(135);
  });
});
