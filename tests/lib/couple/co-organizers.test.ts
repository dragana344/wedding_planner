// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createCoOrganizer, deleteCoOrganizer, listCoOrganizers, resetCoOrganizerPassword } from "@/lib/couple/co-organizers";
import { verifyCoupleLogin } from "@/lib/couple/auth";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const RUN = `col${Date.now().toString(36)}`;
let venueId: string;
let eventId: string;
let otherEventId: string;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "CoOrg Lib Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: e1 } = await admin.from("events").insert({ venue_id: venueId, couple_names: "A", event_date: "2027-05-10" }).select("id").single();
  const { data: e2 } = await admin.from("events").insert({ venue_id: venueId, couple_names: "B", event_date: "2027-05-11" }).select("id").single();
  eventId = e1!.id;
  otherEventId = e2!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("lib/couple/co-organizers (A12)", () => {
  it("creates, lists (without secrets), re-keys and removes a co-organizer", async () => {
    const created = await createCoOrganizer(eventId, { side: "bride", username: `${RUN}-bride`, password: "first-password-1" });
    expect(created).toMatchObject({ side: "bride", username: `${RUN}-bride` });
    expect(Object.keys(created).sort()).toEqual(["created_at", "id", "side", "username"]);
    expect(await listCoOrganizers(eventId)).toEqual([created]);

    await resetCoOrganizerPassword(eventId, created.id, "second-password-2");
    expect(await verifyCoupleLogin(`${RUN}-bride`, "first-password-1")).toEqual({ errorCode: "invalid" });
    expect(await verifyCoupleLogin(`${RUN}-bride`, "second-password-2")).toMatchObject({ eventId, side: "bride" });

    await deleteCoOrganizer(eventId, created.id);
    expect(await listCoOrganizers(eventId)).toEqual([]);
  });

  it("explains a taken side, a taken username and a short password in Macedonian", async () => {
    await createCoOrganizer(eventId, { side: "groom", username: `${RUN}-groom`, password: "groom-password-1" });
    await expect(createCoOrganizer(eventId, { side: "groom", username: `${RUN}-g2`, password: "groom-password-1" })).rejects.toThrow(
      "Оваа страна веќе има ко-организатор.",
    );
    await expect(createCoOrganizer(otherEventId, { side: "groom", username: `${RUN}-groom`, password: "groom-password-1" })).rejects.toThrow(
      "Корисничкото име е зафатено.",
    );
    await expect(createCoOrganizer(otherEventId, { side: "bride", username: `${RUN}-x`, password: "short" })).rejects.toThrow(
      "Лозинката мора да има најмалку 10 знаци.",
    );
  });

  it("never touches another event's co-organizer", async () => {
    const theirs = await createCoOrganizer(otherEventId, { side: "bride", username: `${RUN}-theirs`, password: "their-password-1" });
    await deleteCoOrganizer(eventId, theirs.id);
    await expect(resetCoOrganizerPassword(eventId, theirs.id, "hijacked-password")).rejects.toThrow("Ко-организаторот не е пронајден.");
    expect(await listCoOrganizers(otherEventId)).toHaveLength(1);
    expect(await verifyCoupleLogin(`${RUN}-theirs`, "their-password-1")).toMatchObject({ eventId: otherEventId });
  });
});
