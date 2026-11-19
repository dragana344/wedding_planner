// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { upsertInvitation } from "@/lib/couple/invitations";
import { submitRsvpBySlug } from "@/lib/couple/rsvp";
import {
  ANSWER_ALREADY_RESOLVED_ERROR,
  AnswerConflictError,
  countPendingAnswers,
  listAnswers,
  listGuestAnswerHistory,
  recordCoupleAnswer,
  resolveAnswer,
  trackCoupleEdit,
} from "@/lib/couple/rsvp-answers";
import { issueRememberToken, readRememberToken } from "@/lib/couple/rsvp-remember";
import { CHILDREN_OVER_PARTY_ERROR } from "@/lib/couple/rsvp-answer-view";
import { deleteGuest, getGuestStats, updateGuest, updateGuestStatus } from "@/lib/couple/guests";

// Group B task 1 (0179): every answer kept on its own, the shared link's
// safer matching, the "Да се провери" queue, the couple's phone answers and
// the before/after history.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const venues: string[] = [];

afterAll(async () => {
  if (venues.length) await admin.from("venues").delete().in("id", venues);
});

async function setup(name: string) {
  const { data: venue } = await admin.from("venues").insert({ name: `Answers ${name} ${Date.now()}` }).select("id").single();
  venues.push(venue!.id);
  const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: name, event_date: "2027-07-01" }).select("id").single();
  const invitation = await upsertInvitation(event!.id, { template_id: "romantic-floral", message: null });
  return { venueId: venue!.id as string, eventId: event!.id as string, slug: invitation.public_slug };
}

async function guest(eventId: string, fields: Record<string, unknown>) {
  const { data, error } = await admin.from("event_guests").insert({ event_id: eventId, rsvp_status: "invited", ...fields }).select("id, invite_token").single();
  if (error) throw error;
  return data!;
}

async function answers(eventId: string) {
  const { data } = await admin.from("event_rsvp_answers").select("*").eq("event_id", eventId).order("created_at");
  return data ?? [];
}

async function row(id: string) {
  return (await admin.from("event_guests").select("*").eq("id", id).single()).data!;
}

describe("answers are kept, one row each (0179)", () => {
  it("personal and shared answers each get a row with before/after; the guest gets household names", async () => {
    const { eventId, slug } = await setup("Kept");
    const g = await guest(eventId, { full_name: "Ана Петровска", party_size: 2, rsvp_status: "invited" });

    await submitRsvpBySlug(slug, { guestToken: g.invite_token, status: "confirmed", partySize: 3, childrenCount: 1, householdNames: [" Марко ", "", "Ива"] });
    const shared = await submitRsvpBySlug(slug, { fullName: "ана петровска", status: "confirmed", partySize: 4, phone: "070 111 222" });
    expect(shared.guestId).toBe(g.id);
    expect(readRememberToken(eventId, shared.remember)).toBe(g.id);

    const rows = await answers(eventId);
    expect(rows.map((r) => [r.source, r.match, r.review_state, r.guest_id])).toEqual([
      ["personal", "personal", "none", g.id],
      ["shared", "exact", "none", g.id],
    ]);
    expect(rows[0].before).toMatchObject({ status: "invited", party_size: 2 });
    expect(rows[0].after).toMatchObject({ status: "confirmed", party_size: 3, children_count: 1, household_names: ["Марко", "Ива"] });
    expect(rows[1].before).toMatchObject({ party_size: 3 });
    expect(rows[1].after).toMatchObject({ party_size: 4 });
    expect(rows[1]).toMatchObject({ full_name: "ана петровска", phone: "070 111 222" });
    // The typed phone fills the guest's empty phone; the shared answer keeps the household names it did not send.
    expect(await row(g.id)).toMatchObject({ party_size: 4, phone: "070 111 222", rsvp_previous_status: "confirmed" });
  });

  it("refuses more children than people on every path, writing nothing", async () => {
    const { eventId, slug } = await setup("Children");
    const g = await guest(eventId, { full_name: "Јана", party_size: 2 });
    await expect(submitRsvpBySlug(slug, { guestToken: g.invite_token, status: "confirmed", partySize: 2, childrenCount: 3 })).rejects.toThrow(CHILDREN_OVER_PARTY_ERROR);
    await expect(submitRsvpBySlug(slug, { fullName: "Нов", status: "confirmed", partySize: 1, childrenCount: 2 })).rejects.toThrow(CHILDREN_OVER_PARTY_ERROR);
    await expect(recordCoupleAnswer(eventId, g.id, { status: "confirmed", partySize: 1, childrenCount: 2 }, "couple")).rejects.toThrow(CHILDREN_OVER_PARTY_ERROR);
    expect(await answers(eventId)).toEqual([]);
    const { count } = await admin.from("event_guests").select("id", { count: "exact", head: true }).eq("event_id", eventId);
    expect(count).toBe(1);
    // The table's own check too.
    const { error } = await admin.from("event_rsvp_answers").insert({ event_id: eventId, source: "couple", full_name: "x", status: "confirmed", party_size: 1, children_count: 2, match: "couple" });
    expect(error).not.toBeNull();
  });

  it("accepts any party size up to the database's 100, above the invited number, and flags it", async () => {
    const { eventId, slug } = await setup("Invited");
    const g = await guest(eventId, { full_name: "Марко Марков", party_size: 2, invited_party_size: 2 });
    await submitRsvpBySlug(slug, { guestToken: g.invite_token, status: "confirmed", partySize: 7 });
    expect((await row(g.id)).party_size).toBe(7);
    const [a] = await listAnswers(eventId);
    expect(a).toMatchObject({ partySize: 7, invitedPartySize: 2, guestName: "Марко Марков" });
  });
});

describe("shared-link matching (0179)", () => {
  it("a cross-script or several-namesakes answer waits for the couple, changing nobody", async () => {
    const { eventId, slug } = await setup("Review");
    const g = await guest(eventId, { full_name: "Петар Петровски", party_size: 1 });
    const result = await submitRsvpBySlug(slug, { fullName: "Petar Petrovski", status: "confirmed", partySize: 5, comment: "Доаѓаме" });
    expect(result).toEqual({ eventId, guestId: null, answerId: expect.any(String), remember: null });
    expect(await row(g.id)).toMatchObject({ rsvp_status: "invited", party_size: 1, rsvp_comment: null });
    expect(await countPendingAnswers(eventId)).toBe(1);
    const [pending] = await listAnswers(eventId);
    expect(pending).toMatchObject({ reviewState: "pending", match: "review", guestId: null, comment: "Доаѓаме" });
    expect(pending.suggestions).toEqual([{ id: g.id, fullName: "Петар Петровски" }]);
    // Logged for the couple's notifications, as a reply to check.
    const { data: audit } = await admin.from("audit_log").select("target_id, details").eq("event_id", eventId).eq("action", "public_rsvp");
    expect(audit).toEqual([{ target_id: null, details: expect.objectContaining({ review: true, new_status: "confirmed" }) }]);
  });

  it("a remembered browser updates the same guest even under a different name; a forged token does not", async () => {
    const { eventId, slug } = await setup("Remember");
    const g = await guest(eventId, { full_name: "Ива Ивановска" });
    const other = await setup("Remember other");
    const first = await submitRsvpBySlug(slug, { fullName: "Ива Ивановска", status: "later", partySize: 1 });
    expect(first.guestId).toBe(g.id);

    const again = await submitRsvpBySlug(slug, { fullName: "Ivа", status: "confirmed", partySize: 2, remember: first.remember });
    expect(again.guestId).toBe(g.id);
    expect((await answers(eventId)).at(-1)).toMatchObject({ match: "remembered", guest_id: g.id });

    // Another event's token or garbage is ignored: the name rules apply ("Непознат" → a new guest).
    const foreign = issueRememberToken(other.eventId, g.id);
    const fresh = await submitRsvpBySlug(slug, { fullName: "Непознат Гостин", status: "declined", partySize: 1, remember: foreign });
    expect(fresh.guestId).not.toBe(g.id);
    expect((await answers(eventId)).at(-1)).toMatchObject({ match: "new" });
  });

  it("a unique phone finds the guest; phone and name pointing at different guests waits", async () => {
    const { eventId, slug } = await setup("Phone");
    const ana = await guest(eventId, { full_name: "Ана Ристова", phone: "+389 70 555 555" });
    const boris = await guest(eventId, { full_name: "Борис Ристов" });
    const byPhone = await submitRsvpBySlug(slug, { fullName: "Ana Ristova", phone: "070/555-555", status: "confirmed", partySize: 2 });
    expect(byPhone.guestId).toBe(ana.id);
    expect((await answers(eventId)).at(-1)).toMatchObject({ match: "phone" });

    const mixed = await submitRsvpBySlug(slug, { fullName: "Борис Ристов", phone: "070 555 555", status: "declined", partySize: 1 });
    expect(mixed.guestId).toBeNull();
    expect((await row(boris.id)).rsvp_status).toBe("invited");
  });
});

describe("resolving 'Да се провери' (0179)", () => {
  async function pendingFor(name: string) {
    const ctx = await setup(name);
    const g = await guest(ctx.eventId, { full_name: "Марија Маркова", party_size: 1, rsvp_status: "invited" });
    await guest(ctx.eventId, { full_name: "Марија Маркова", party_size: 1 });
    await submitRsvpBySlug(ctx.slug, { fullName: "Марија Маркова", phone: "071 222 333", status: "confirmed", partySize: 3, householdNames: ["Јован"] });
    const [a] = await listAnswers(ctx.eventId);
    return { ...ctx, guestId: g.id, answerId: a.id };
  }

  it("'Ова е …' applies it exactly like an automatic match, with before/after; only once", async () => {
    const p = await pendingFor("Resolve guest");
    const updated = await resolveAnswer(p.eventId, p.answerId, { kind: "guest", guestId: p.guestId }, "bride");
    expect(updated).toMatchObject({ id: p.guestId, rsvp_status: "confirmed", party_size: 3, household_names: ["Јован"], phone: "071 222 333" });
    const [a] = await answers(p.eventId);
    expect(a).toMatchObject({ review_state: "applied", guest_id: p.guestId, resolved_by: "bride", match: "review" });
    expect(a.before).toMatchObject({ status: "invited", party_size: 1 });
    expect(a.after).toMatchObject({ status: "confirmed", party_size: 3 });
    expect(a.resolved_at).not.toBeNull();
    await expect(resolveAnswer(p.eventId, p.answerId, { kind: "ignore" }, "couple")).rejects.toThrow(ANSWER_ALREADY_RESOLVED_ERROR);
    // It now shows in the guest's history.
    const history = await listGuestAnswerHistory(p.eventId, p.guestId);
    expect(history).toHaveLength(1);
    expect(history[0].after).toMatchObject({ party_size: 3 });
    expect(await countPendingAnswers(p.eventId)).toBe(0);
  });

  it("'Нов гостин' creates the guest from the answer (no 'before'); 'Игнорирај' changes nobody", async () => {
    const p = await pendingFor("Resolve new");
    const created = await resolveAnswer(p.eventId, p.answerId, { kind: "new" }, "couple");
    expect(created).toMatchObject({ full_name: "Марија Маркова", rsvp_status: "confirmed", party_size: 3 });
    expect((await answers(p.eventId))[0]).toMatchObject({ guest_id: created!.id, before: null });

    const q = await pendingFor("Resolve ignore");
    expect(await resolveAnswer(q.eventId, q.answerId, { kind: "ignore" }, "couple")).toBeNull();
    expect((await answers(q.eventId))[0]).toMatchObject({ review_state: "ignored", guest_id: null });
    expect((await row(q.guestId)).rsvp_status).toBe("invited");
  });

  it("refuses another event's guest and puts nothing in a half-resolved state", async () => {
    const p = await pendingFor("Resolve foreign");
    const other = await setup("Resolve foreign other");
    const stranger = await guest(other.eventId, { full_name: "Странец" });
    await expect(resolveAnswer(p.eventId, p.answerId, { kind: "guest", guestId: stranger.id }, "couple")).rejects.toThrow("Гостинот не е пронајден.");
    await expect(resolveAnswer(other.eventId, p.answerId, { kind: "ignore" }, "couple")).rejects.toThrow("Одговорот не е пронајден.");
    expect((await answers(p.eventId))[0]).toMatchObject({ review_state: "pending", resolved_at: null });
  });
});

describe("the couple's phone answer and the history (decisions 7, 8)", () => {
  it("applies through the same path and keeps every change in the history, newest first", async () => {
    const { eventId } = await setup("Couple answer");
    const { data: menuA } = await admin.from("menu_templates").insert({ venue_id: venues.at(-1)!, name: "А" }).select("id").single();
    const { data: menuB } = await admin.from("menu_templates").insert({ venue_id: venues.at(-1)!, name: "Б" }).select("id").single();
    await admin.from("event_menu_templates").insert([{ event_id: eventId, menu_template_id: menuA!.id }, { event_id: eventId, menu_template_id: menuB!.id }]);
    const g = await guest(eventId, { full_name: "Баба Ленка", party_size: 1 });

    await expect(recordCoupleAnswer(eventId, g.id, { status: "confirmed", partySize: 2 }, "couple")).rejects.toThrow("Изберете мени за сите 2 лица.");
    const saved = await recordCoupleAnswer(
      eventId, g.id,
      { status: "confirmed", partySize: 2, childrenCount: 0, menuCounts: { [menuA!.id]: 1, [menuB!.id]: 1 }, allergies: "глутен", comment: "по телефон" },
      "groom",
    );
    expect(saved).toMatchObject({ rsvp_status: "confirmed", party_size: 2, allergies: "глутен", rsvp_comment: "по телефон" });
    // Not through the link: no link marker.
    expect((await row(g.id)).rsvp_changed_via_link_at).toBeNull();
    await recordCoupleAnswer(eventId, g.id, { status: "declined", partySize: 1 }, "couple");

    const history = await listGuestAnswerHistory(eventId, g.id);
    expect(history.map((h) => [h.source, h.before?.status, h.after?.status])).toEqual([
      ["couple", "confirmed", "declined"],
      ["couple", "invited", "confirmed"],
    ]);
    expect(history[1].after?.menu_counts).toEqual({ [menuA!.id]: 1, [menuB!.id]: 1 });
    expect((await answers(eventId)).every((a) => a.match === "couple" && a.full_name === "Баба Ленка")).toBe(true);
  });

  it("refuses another event's guest", async () => {
    const mine = await setup("Couple foreign");
    const other = await setup("Couple foreign other");
    const stranger = await guest(other.eventId, { full_name: "Странец" });
    await expect(recordCoupleAnswer(mine.eventId, stranger.id, { status: "later", partySize: 1 }, "couple")).rejects.toThrow("Гостинот не е пронајден.");
    expect((await row(stranger.id)).rsvp_status).toBe("invited");
  });
});

describe("table rules (0179)", () => {
  it("a deleted guest's answers go with them (0184); pending ones stay until the event is erased", async () => {
    const { eventId, slug } = await setup("Cascade");
    const g = await guest(eventId, { full_name: "Тодор" });
    await guest(eventId, { full_name: "Петар Петровски" });
    await guest(eventId, { full_name: "Петар Петровски" });
    await submitRsvpBySlug(slug, { fullName: "Тодор", status: "later", partySize: 1 });
    await submitRsvpBySlug(slug, { fullName: "Петар Петровски", status: "later", partySize: 1 });
    expect((await answers(eventId)).map((a) => a.review_state).sort()).toEqual(["none", "pending"]);
    await deleteGuest(eventId, g.id);
    expect((await answers(eventId)).map((a) => [a.review_state, a.guest_id])).toEqual([["pending", null]]);
    await admin.rpc("erase_event_personal_data", { p_event_id: eventId, p_reason: "retention" });
    expect(await answers(eventId)).toEqual([]);
  });

  it("rejects unknown sources, matches and review states", async () => {
    const { eventId } = await setup("Checks");
    const base = { event_id: eventId, source: "shared", full_name: "x", status: "later", match: "exact" };
    for (const bad of [{ source: "email" }, { match: "guess" }, { review_state: "maybe" }, { status: "maybe" }, { resolved_by: "venue" }]) {
      const { error } = await admin.from("event_rsvp_answers").insert({ ...base, ...bad });
      expect(error, JSON.stringify(bad)).not.toBeNull();
    }
    const { error: invitedError } = await admin.from("event_guests").insert({ event_id: eventId, full_name: "y", invited_party_size: 0 });
    expect(invitedError).not.toBeNull();
  });
});

describe("final-review fixes (0184)", () => {
  async function withMenus(ctx: { venueId: string; eventId: string }, names: string[]) {
    const ids: string[] = [];
    for (const name of names) {
      const { data } = await admin.from("menu_templates").insert({ venue_id: ctx.venueId, name }).select("id").single();
      await admin.from("event_menu_templates").insert({ event_id: ctx.eventId, menu_template_id: data!.id });
      ids.push(data!.id);
    }
    return ids;
  }

  async function pendingFor(name: string) {
    const ctx = await setup(name);
    const g = await guest(ctx.eventId, { full_name: "Марија Маркова", party_size: 1 });
    await guest(ctx.eventId, { full_name: "Марија Маркова", party_size: 1 });
    return { ...ctx, guestId: g.id };
  }

  async function submitPending(ctx: { eventId: string; slug: string }, input: Record<string, unknown> = {}) {
    await submitRsvpBySlug(ctx.slug, { fullName: "Марија Маркова", status: "confirmed", partySize: 3, ...input });
    const pending = (await listAnswers(ctx.eventId)).find((a) => a.reviewState === "pending")!;
    return pending.id;
  }

  it("an answer whose menus the event no longer has still applies, with the menus to choose again", async () => {
    const ctx = await pendingFor("Stale menus");
    const [a, b] = await withMenus(ctx, ["Месо", "Посно"]);
    const answerId = await submitPending(ctx, { menuCounts: { [a]: 2, [b]: 1 } });
    // The venue swaps "Посно" for "Риба" before the couple resolves it.
    await admin.from("event_menu_templates").delete().eq("event_id", ctx.eventId).eq("menu_template_id", b);
    await withMenus(ctx, ["Риба"]);

    const updated = await resolveAnswer(ctx.eventId, answerId, { kind: "guest", guestId: ctx.guestId }, "couple");
    expect(updated).toMatchObject({ rsvp_status: "confirmed", party_size: 3, menu_counts: {} });
    expect(updated!.menu_rechoose_at).not.toBeNull();
    expect((await answers(ctx.eventId)).find((r) => r.id === answerId)).toMatchObject({ review_state: "applied", guest_id: ctx.guestId });
    expect((await getGuestStats(ctx.eventId)).menuRechoose).toBe(1);
  });

  it("'Нов гостин' is one transaction: a failure leaves no blank guest and the answer pending; a resolved answer is refused by the database too", async () => {
    const ctx = await pendingFor("Atomic");
    const answerId = await submitPending(ctx);
    const guestCount = async () => (await admin.from("event_guests").select("id").eq("event_id", ctx.eventId)).data!.length;
    const before = await guestCount();
    const { error } = await admin.rpc("apply_rsvp_answer", {
      p_event_id: ctx.eventId,
      p_guest_id: null,
      p_new_name: "Марија Маркова",
      p_answer: { status: "confirmed", party_size: 1, menu_counts: { [crypto.randomUUID()]: 1 } },
      p_via_link: true,
      p_resolve_id: answerId,
      p_resolved_by: "couple",
    });
    expect(error).not.toBeNull();
    expect(await guestCount()).toBe(before);
    expect((await answers(ctx.eventId)).find((r) => r.id === answerId)).toMatchObject({ review_state: "pending", resolved_at: null });

    const created = await resolveAnswer(ctx.eventId, answerId, { kind: "new" }, "couple");
    expect(await guestCount()).toBe(before + 1);
    const { error: again } = await admin.rpc("apply_rsvp_answer", {
      p_event_id: ctx.eventId, p_guest_id: null, p_new_name: "Марија Маркова", p_answer: { status: "later" },
      p_via_link: true, p_resolve_id: answerId, p_resolved_by: "couple",
    });
    expect(again?.code).toBe("RA001");
    expect(await guestCount()).toBe(before + 1);
    expect(created).toMatchObject({ rsvp_status: "confirmed" });
  });

  it("a guest with a newer answer is not overwritten silently: conflict, then 'Само поврзи' or 'Примени го сепак'", async () => {
    const ctx = await pendingFor("Conflict");
    const first = await submitPending(ctx);
    await recordCoupleAnswer(ctx.eventId, ctx.guestId, { status: "declined", partySize: 1 }, "couple");

    const err = await resolveAnswer(ctx.eventId, first, { kind: "guest", guestId: ctx.guestId }, "couple").catch((e) => e);
    expect(err).toBeInstanceOf(AnswerConflictError);
    expect(err.message).toMatch(/^Овој гостин има понов одговор \(\d\d\.\d\d \d\d:\d\d\)\.$/);
    expect((await answers(ctx.eventId)).find((r) => r.id === first)).toMatchObject({ review_state: "pending" });

    const linked = await resolveAnswer(ctx.eventId, first, { kind: "guest", guestId: ctx.guestId, mode: "link" }, "couple");
    expect(linked).toMatchObject({ rsvp_status: "declined", party_size: 1 });
    expect((await answers(ctx.eventId)).find((r) => r.id === first)).toMatchObject({ review_state: "linked", guest_id: ctx.guestId });
    expect((await listGuestAnswerHistory(ctx.eventId, ctx.guestId)).find((h) => h.id === first)).toMatchObject({ linked: true });

    const second = await submitPending(ctx, { partySize: 2 });
    // Newer than the couple's answer: no conflict, it applies.
    const applied = await resolveAnswer(ctx.eventId, second, { kind: "guest", guestId: ctx.guestId }, "couple");
    expect(applied).toMatchObject({ rsvp_status: "confirmed", party_size: 2 });
    // An older one applied anyway overwrites on purpose.
    await recordCoupleAnswer(ctx.eventId, ctx.guestId, { status: "later", partySize: 1 }, "couple");
    const third = await submitPending(ctx, { partySize: 4 });
    await admin.from("event_rsvp_answers").update({ created_at: "2026-01-01T10:00:00Z" }).eq("id", third);
    await expect(resolveAnswer(ctx.eventId, third, { kind: "guest", guestId: ctx.guestId }, "couple")).rejects.toBeInstanceOf(AnswerConflictError);
    expect(await resolveAnswer(ctx.eventId, third, { kind: "guest", guestId: ctx.guestId, mode: "apply" }, "couple")).toMatchObject({ party_size: 4 });
  });

  it("the couple's direct edits are kept in the history with before/after (decision 8), and nothing when nothing changed", async () => {
    const { eventId } = await setup("Couple edits");
    const g = await guest(eventId, { full_name: "Вера", party_size: 2 });
    await trackCoupleEdit(eventId, g.id, () => updateGuestStatus(eventId, g.id, "confirmed"));
    await trackCoupleEdit(eventId, g.id, () => updateGuestStatus(eventId, g.id, "confirmed"));
    await trackCoupleEdit(eventId, g.id, () =>
      updateGuest(eventId, g.id, { full_name: "Вера", phone: null, party_size: 4, notes: "нова белешка", side: null }),
    );
    await trackCoupleEdit(eventId, g.id, () => updateGuest(eventId, g.id, { full_name: "Вера В.", phone: null, party_size: 4, notes: null, side: null }));
    await trackCoupleEdit(eventId, g.id, () => updateGuestStatus(eventId, g.id, "pending"));

    const history = await listGuestAnswerHistory(eventId, g.id);
    expect(history.map((h) => [h.source, h.before?.status, h.after?.status, h.before?.party_size, h.after?.party_size])).toEqual([
      ["couple", "confirmed", "pending", 4, 4],
      ["couple", "confirmed", "confirmed", 2, 4],
      ["couple", "invited", "confirmed", 2, 2],
    ]);
    expect((await answers(eventId)).map((a) => [a.status, a.party_size, a.match])).toEqual([
      ["confirmed", 2, "couple"],
      ["confirmed", 4, "couple"],
      ["pending", null, "couple"],
    ]);
  });

  it("the inbox always loads every pending answer; only resolved ones are capped", async () => {
    const ctx = await pendingFor("Inbox cap");
    const answerId = await submitPending(ctx);
    await admin.from("event_rsvp_answers").update({ created_at: "2026-01-01T10:00:00Z" }).eq("id", answerId);
    const filler = Array.from({ length: 1000 }, (_, i) => ({
      event_id: ctx.eventId, source: "shared", full_name: `Гостин ${i}`, status: "later", match: "new", review_state: "none",
    }));
    const { error } = await admin.from("event_rsvp_answers").insert(filler);
    expect(error).toBeNull();
    // The couple's own edits live in each guest's history, not in the inbox.
    const { error: coupleError } = await admin
      .from("event_rsvp_answers")
      .insert({ event_id: ctx.eventId, source: "couple", full_name: "Внесено од младенците", status: "later", match: "couple", review_state: "none" });
    expect(coupleError).toBeNull();
    const list = await listAnswers(ctx.eventId);
    expect(list).toHaveLength(1001);
    expect(list.at(-1)).toMatchObject({ id: answerId, reviewState: "pending" });
    expect(list.some((a) => a.source === "couple")).toBe(false);
  });
});
