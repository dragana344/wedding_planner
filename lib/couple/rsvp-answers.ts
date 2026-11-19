import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAudit } from "@/lib/audit";
import { eventMenuIds, getGuest, type Guest } from "@/lib/couple/guests";
import { NO_MEAL_OVER_CHILDREN_ERROR, validateMenuCounts, type MenuCounts } from "@/lib/couple/guest-menus";
import { suggestGuests } from "@/lib/couple/rsvp-match";
import {
  checkPartyNumbers,
  cleanHouseholdNames,
  type AnswerMatch,
  type AnswerSnapshot,
  type AnswerSource,
  type GuestAnswerHistoryItem,
  type InboxAnswer,
  newerAnswerText,
  type ReviewReason,
  type ReviewState,
} from "@/lib/couple/rsvp-answer-view";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";
import { errorFields, log } from "@/lib/log";

// Every RSVP answer, kept on its own (group B task 1, migration 0179): from
// a guest's personal link, from the shared link, or typed by the couple for a
// guest who answered by phone. One apply path for all of them
// (`applyAnswer`), so the guest row, the menu counts and the before/after
// history always change the same way. Shared-link answers the matching is
// unsure about are stored 'pending' and applied only when the couple says
// whose they are (`resolveAnswer`).

export type AnswerStatus = "confirmed" | "declined" | "later";
/** What an answer row may hold: a guest's answer, or (0184) any status the couple set themselves. */
export type StoredStatus = AnswerStatus | "invited" | "pending";

export interface AnswerInput {
  status: AnswerStatus;
  partySize: number;
  childrenCount?: number;
  /** How many of the party eat each of the event's menus (menu id -> count). */
  menuCounts?: MenuCounts;
  /** Of the children: how many eat no adult menu (0181). */
  noMealCount?: number;
  allergies?: string | null;
  comment?: string | null;
  /** Optional names of the people coming with the guest. */
  householdNames?: (string | null)[] | null;
}

/** An answer checked against the event, ready to store and apply. Party details only with a yes. */
export interface PreparedAnswer {
  status: StoredStatus;
  partySize: number | null;
  childrenCount: number;
  menuCounts: MenuCounts;
  /** Of the children: how many eat no adult menu (0181). */
  noMealCount: number;
  allergies: string | null;
  comment: string | null;
  householdNames: string[];
}

export const ANSWER_NOT_FOUND_ERROR = "Одговорот не е пронајден.";
export const ANSWER_ALREADY_RESOLVED_ERROR = "Овој одговор е веќе решен.";
export const GUEST_NOT_FOUND_ERROR = "Гостинот не е пронајден.";

/** Who resolved a pending answer: the couple's own login or a co-organizer's side. */
export type Resolver = "couple" | "bride" | "groom";

/** Trimmed text, or null when blank. */
function cleanText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Checks an answer before anything is written, the same for every path:
 * children never more than the party, and with 2+ menus a yes says which
 * menu each person eats. Throws the message to show.
 */
export async function prepareAnswer(eventId: string, input: AnswerInput): Promise<PreparedAnswer> {
  const comment = cleanText(input.comment);
  if (input.status !== "confirmed") {
    return { status: input.status, partySize: null, childrenCount: 0, menuCounts: {}, noMealCount: 0, allergies: null, comment, householdNames: [] };
  }
  const partySize = Math.max(1, Math.floor(input.partySize));
  const childrenCount = Math.max(0, Math.floor(input.childrenCount ?? 0));
  const numbersError = checkPartyNumbers(partySize, childrenCount);
  if (numbersError) throw new Error(numbersError);
  const noMealCount = Math.max(0, Math.floor(input.noMealCount ?? 0));
  if (noMealCount > childrenCount) throw new Error(NO_MEAL_OVER_CHILDREN_ERROR);
  let menuCounts: MenuCounts = {};
  const menuIds = await eventMenuIds(eventId);
  if (menuIds.length >= 2) {
    const checked = validateMenuCounts(menuIds, partySize, input.menuCounts ?? {}, noMealCount);
    if (!checked.ok) throw new Error(checked.error);
    menuCounts = checked.counts;
  }
  return {
    status: "confirmed",
    partySize,
    childrenCount,
    menuCounts,
    noMealCount,
    allergies: cleanText(input.allergies),
    comment,
    householdNames: cleanHouseholdNames(input.householdNames),
  };
}

/** A guest's answer fields now, as the before/after history stores them (0184 `rsvp_guest_snapshot`). */
export async function guestSnapshot(guestId: string): Promise<AnswerSnapshot | null> {
  const { data, error } = await createServiceRoleClient().rpc("rsvp_guest_snapshot", { p_guest_id: guestId });
  if (error) throw error;
  return (data as AnswerSnapshot | null) ?? null;
}

/** Errors apply_rsvp_answer raises on purpose (0184), as the messages the couple sees. */
const APPLY_ERRORS: Record<string, string> = {
  RA001: ANSWER_ALREADY_RESOLVED_ERROR,
  RA002: GUEST_NOT_FOUND_ERROR,
};

export type ApplyTarget = { guestId: string } | { newGuestName: string };

export type ApplyOptions = {
  /** Through the invitation (SEC-021's last-change time and previous status). */
  viaLink: boolean;
  /** Typed on the shared link: fills an empty guest phone, never replaces one. */
  phone?: string | null;
  /** The answer's menus no longer fit the event's: the guest is asked to choose again. */
  rechoose?: boolean;
  /** Store a new answer row with it. `fullName` null: the guest's own name. */
  record?: { source: AnswerSource; fullName: string | null; phone: string | null; match: AnswerMatch };
  /** Or resolve this pending answer with it ("Само поврзи" with `linkOnly`: the guest is not changed). */
  resolve?: { answerId: string; by: Resolver; linkOnly?: boolean };
};

export type ApplyResult = { guestId: string; answerId: string | null; guestName: string; before: AnswerSnapshot | null; after: AnswerSnapshot };

/**
 * Applies an answer to a guest — the one write path for the guest's answer
 * fields, in one transaction (0184 `apply_rsvp_answer`): a new guest when
 * the target names one, the answer fields, the menu split, the before/after
 * snapshots and the answer row. Anything failing (the guest limit, a menu
 * the event no longer has, a second tap) leaves nothing behind. With a yes
 * the party details and the menu split replace what was there; otherwise
 * they stay (a "later" or "no" keeps the couple's numbers and the guest's
 * menu choice, 0181 — it is only left out of the totals until they confirm
 * again).
 */
export async function applyAnswer(eventId: string, target: ApplyTarget, answer: PreparedAnswer, opts: ApplyOptions): Promise<ApplyResult> {
  const { data, error } = await createServiceRoleClient().rpc("apply_rsvp_answer", {
    p_event_id: eventId,
    p_guest_id: "guestId" in target ? target.guestId : null,
    p_new_name: "newGuestName" in target ? target.newGuestName : null,
    p_answer: {
      status: answer.status,
      party_size: answer.partySize,
      children_count: answer.childrenCount,
      no_meal_count: answer.noMealCount,
      menu_counts: answer.menuCounts,
      allergies: answer.allergies,
      comment: answer.comment,
      household_names: answer.householdNames,
    },
    p_via_link: opts.viaLink,
    p_phone: cleanText(opts.phone),
    p_rechoose: opts.rechoose ?? false,
    p_record: opts.record
      ? { source: opts.record.source, full_name: opts.record.fullName, phone: cleanText(opts.record.phone), match: opts.record.match }
      : null,
    p_resolve_id: opts.resolve?.answerId ?? null,
    p_resolved_by: opts.resolve?.by ?? null,
    p_link_only: opts.resolve?.linkOnly ?? false,
  });
  if (error) {
    const message = APPLY_ERRORS[error.code];
    if (message) throw new Error(message);
    throw error;
  }
  const r = data as { guest_id: string; answer_id: string | null; guest_name: string; before: AnswerSnapshot | null; after: AnswerSnapshot };
  return { guestId: r.guest_id, answerId: r.answer_id, guestName: r.guest_name, before: r.before, after: r.after };
}

export interface AnswerRecord {
  eventId: string;
  guestId: string | null;
  source: AnswerSource;
  fullName: string;
  phone: string | null;
  answer: PreparedAnswer;
  match: AnswerMatch;
  reviewState: ReviewState;
  /** Why a pending answer waits besides an unsure match (0180). */
  reviewReason?: ReviewReason | null;
  before: AnswerSnapshot | null;
  after: AnswerSnapshot | null;
}

/** Stores one answer row (never updated afterwards, except a pending one's resolution). */
export async function insertAnswer(r: AnswerRecord): Promise<string> {
  const { data, error } = await createServiceRoleClient()
    .from("event_rsvp_answers")
    .insert({
      event_id: r.eventId,
      guest_id: r.guestId,
      source: r.source,
      full_name: r.fullName.slice(0, 200),
      phone: cleanText(r.phone)?.slice(0, 50) ?? null,
      status: r.answer.status,
      party_size: r.answer.partySize,
      children_count: r.answer.childrenCount,
      menu_counts: r.answer.menuCounts,
      no_meal_count: r.answer.noMealCount,
      allergies: r.answer.allergies,
      comment: r.answer.comment,
      household_names: r.answer.householdNames,
      match: r.match,
      review_state: r.reviewState,
      review_reason: r.reviewReason ?? null,
      before: r.before,
      after: r.after,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

type AnswerRow = {
  id: string;
  event_id: string;
  guest_id: string | null;
  source: AnswerSource;
  full_name: string;
  phone: string | null;
  status: StoredStatus;
  party_size: number | null;
  children_count: number;
  menu_counts: MenuCounts | null;
  no_meal_count: number | null;
  allergies: string | null;
  comment: string | null;
  household_names: string[] | null;
  match: AnswerMatch;
  review_state: ReviewState;
  review_reason: ReviewReason | null;
  before: AnswerSnapshot | null;
  after: AnswerSnapshot | null;
  created_at: string;
};

const ANSWER_COLUMNS =
  "id, event_id, guest_id, source, full_name, phone, status, party_size, children_count, menu_counts, no_meal_count, allergies, comment, household_names, match, review_state, review_reason, before, after, created_at";

function preparedFromRow(row: AnswerRow): PreparedAnswer {
  return {
    status: row.status,
    partySize: row.party_size,
    childrenCount: row.children_count,
    menuCounts: row.menu_counts ?? {},
    noMealCount: row.no_meal_count ?? 0,
    allergies: row.allergies,
    comment: row.comment,
    householdNames: row.household_names ?? [],
  };
}

/** Pending answers waiting for the couple (the "Да се провери" count). */
export async function countPendingAnswers(eventId: string): Promise<number> {
  const { count, error } = await createServiceRoleClient()
    .from("event_rsvp_answers")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("review_state", "pending");
  if (error) throw error;
  return count ?? 0;
}

/**
 * The couple's inbox: every answer guests sent, newest first, pending ones
 * with the guests they most likely belong to. The couple's own edits
 * (source 'couple') stay out of it — they show in each guest's history.
 * Every pending answer is loaded (each one needs the couple); only the
 * resolved history is capped, to the newest MAX_LIST_ROWS.
 */
export async function listAnswers(eventId: string): Promise<InboxAnswer[]> {
  const client = createServiceRoleClient();
  const answersQuery = () => client.from("event_rsvp_answers").select(ANSWER_COLUMNS).eq("event_id", eventId);
  const [pending, resolved, guests] = await Promise.all([
    answersQuery().eq("review_state", "pending").order("created_at", { ascending: false }).order("id"),
    answersQuery().neq("review_state", "pending").neq("source", "couple").order("created_at", { ascending: false }).order("id").limit(MAX_LIST_ROWS),
    client.from("event_guests").select("id, full_name, phone, invited_party_size").eq("event_id", eventId).limit(MAX_LIST_ROWS),
  ]);
  if (pending.error) throw pending.error;
  if (resolved.error) throw resolved.error;
  if (guests.error) throw guests.error;
  const guestRows = checkListBound(guests.data, "event_guests (answers)");
  const byId = new Map(guestRows.map((g) => [g.id, g]));
  const rows = [...(pending.data as unknown as AnswerRow[]), ...checkListBound(resolved.data as unknown as AnswerRow[], "event_rsvp_answers")].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
  );
  return rows.map((a) => {
    const guest = a.guest_id ? byId.get(a.guest_id) : undefined;
    return {
      id: a.id,
      createdAt: a.created_at,
      source: a.source,
      fullName: a.full_name,
      phone: a.phone,
      status: a.status,
      partySize: a.party_size,
      childrenCount: a.children_count,
      menuCounts: a.menu_counts ?? {},
      noMealCount: a.no_meal_count ?? 0,
      allergies: a.allergies,
      comment: a.comment,
      householdNames: a.household_names ?? [],
      match: a.match,
      reviewState: a.review_state,
      reviewReason: a.review_reason,
      guestId: guest ? a.guest_id : null,
      guestName: guest?.full_name ?? null,
      invitedPartySize: guest?.invited_party_size ?? null,
      before: a.before,
      after: a.after,
      suggestions: a.review_state === "pending" ? suggestGuests(guestRows, a.full_name, a.phone).map((g) => ({ id: g.id, fullName: g.full_name })) : [],
    };
  });
}

/**
 * 0180: a greeting sent right after a pending answer moves to the guest the
 * couple applied it to. One greeting per guest stays the rule: if the guest
 * already sent one, the newer greeting is kept as it is — still shown in
 * Честитки under the name typed with the answer — rather than replacing or
 * hiding either. Best effort: the answer is already applied, so a failure
 * here only leaves the greeting unattached.
 */
export async function attachAnswerGreeting(answerId: string, guestId: string): Promise<boolean> {
  const client = createServiceRoleClient();
  try {
    const { count, error } = await client.from("event_greetings").select("id", { count: "exact", head: true }).eq("guest_id", guestId);
    if (error) throw error;
    if ((count ?? 0) > 0) return false;
    const { data, error: updateError } = await client
      .from("event_greetings")
      .update({ guest_id: guestId })
      .eq("rsvp_answer_id", answerId)
      .is("guest_id", null)
      .select("id");
    if (updateError) throw updateError;
    return (data ?? []).length > 0;
  } catch (err) {
    // 23505: the guest's own greeting arrived in between — keep both as they are.
    if ((err as { code?: string }).code !== "23505") log("error", "answer_greeting_attach_failed", { answer_id: answerId, ...errorFields(err) });
    return false;
  }
}

export type Resolution =
  | {
      kind: "guest";
      guestId: string;
      /**
       * When the guest already has a newer answer: "apply" overwrites it anyway
       * ("Примени го сепак"), "link" only ties the answer to the guest without
       * changing their numbers ("Само поврзи"). Left out, a newer answer
       * stops the resolve with an AnswerConflictError.
       */
      mode?: "apply" | "link";
    }
  | { kind: "new" }
  | { kind: "ignore" };

/** The chosen guest has an answer (or a change by the couple) newer than the pending one. */
export class AnswerConflictError extends Error {
  constructor(readonly newerAt: string) {
    super(newerAnswerText(newerAt));
  }
}

/** The newest answer or couple change applied to the guest after `since`, if any. */
async function newerAnswerAt(eventId: string, guestId: string, since: string): Promise<string | null> {
  const { data, error } = await createServiceRoleClient()
    .from("event_rsvp_answers")
    .select("created_at")
    .eq("event_id", eventId)
    .eq("guest_id", guestId)
    .in("review_state", ["none", "applied"])
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.created_at as string | undefined) ?? null;
}

/**
 * A stored answer checked again against the event's menus as they are now:
 * the venue may have changed them since the guest answered. With one menu
 * (or none) there is nothing to choose. With 2+ menus a split that no longer
 * fits is dropped and the guest is asked to choose again (`rechoose`, the
 * couple's "Треба да изберат мени") — the rest of the answer still applies.
 */
async function fitToCurrentMenus(eventId: string, answer: PreparedAnswer): Promise<{ answer: PreparedAnswer; rechoose: boolean }> {
  if (answer.status !== "confirmed" || answer.partySize === null) return { answer, rechoose: false };
  const menuIds = await eventMenuIds(eventId);
  if (menuIds.length < 2) return { answer: { ...answer, menuCounts: {} }, rechoose: false };
  const checked = validateMenuCounts(menuIds, answer.partySize, answer.menuCounts, answer.noMealCount);
  return checked.ok ? { answer: { ...answer, menuCounts: checked.counts }, rechoose: false } : { answer: { ...answer, menuCounts: {} }, rechoose: true };
}

/**
 * The couple's one tap on a pending answer: "Ова е <гостин>", "Нов гостин"
 * or "Игнорирај". The first two apply it as an automatic match would, in one
 * transaction with marking it resolved (so a failure leaves it pending and
 * creates no guest, and two taps at once apply it only once). An answer whose
 * menus the event no longer has still applies, with the menus to choose
 * again. A guest with a newer answer is not overwritten silently: see
 * `Resolution.mode`. Returns the guest it was applied to (null when ignored).
 */
export async function resolveAnswer(eventId: string, answerId: string, resolution: Resolution, by: Resolver): Promise<Guest | null> {
  const client = createServiceRoleClient();
  const { data: row, error } = await client.from("event_rsvp_answers").select(ANSWER_COLUMNS).eq("id", answerId).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(ANSWER_NOT_FOUND_ERROR);
  const answer = row as unknown as AnswerRow;
  if (answer.review_state !== "pending") throw new Error(ANSWER_ALREADY_RESOLVED_ERROR);

  const audit = (guestId: string | null, kind: string) =>
    recordAudit({ action: "rsvp_answer_resolved", actorType: "couple", eventId, targetId: guestId, details: { resolution: kind, by } });

  if (resolution.kind === "ignore") {
    const { data: claimed, error: claimError } = await client
      .from("event_rsvp_answers")
      .update({ review_state: "ignored", resolved_at: new Date().toISOString(), resolved_by: by })
      .eq("id", answerId)
      .eq("review_state", "pending")
      .select("id");
    if (claimError) throw claimError;
    if (!claimed || claimed.length === 0) throw new Error(ANSWER_ALREADY_RESOLVED_ERROR);
    await audit(null, "ignore");
    return null;
  }

  if (resolution.kind === "guest" && !resolution.mode) {
    const newer = await newerAnswerAt(eventId, resolution.guestId, answer.created_at);
    if (newer) throw new AnswerConflictError(newer);
  }
  const linkOnly = resolution.kind === "guest" && resolution.mode === "link";
  const fitted = await fitToCurrentMenus(eventId, preparedFromRow(answer));
  const applied = await applyAnswer(
    eventId,
    resolution.kind === "new" ? { newGuestName: answer.full_name } : { guestId: resolution.guestId },
    fitted.answer,
    { viaLink: true, phone: answer.phone, rechoose: fitted.rechoose, resolve: { answerId, by, linkOnly } },
  );
  await attachAnswerGreeting(answerId, applied.guestId);
  await audit(applied.guestId, linkOnly ? "link" : resolution.kind);
  return getGuest(eventId, applied.guestId);
}

/**
 * Decision 7: the couple types in an answer a guest gave by phone. Same
 * checks and the same apply path as the guest's own form; kept in the
 * history as the couple's.
 */
export async function recordCoupleAnswer(eventId: string, guestId: string, input: AnswerInput, by: Resolver): Promise<Guest> {
  const answer = await prepareAnswer(eventId, input);
  await applyAnswer(eventId, { guestId }, answer, {
    viaLink: false,
    record: { source: "couple", fullName: null, phone: null, match: "couple" },
  });
  await recordAudit({ action: "couple_rsvp_recorded", actorType: "couple", eventId, targetId: guestId, details: { new_status: answer.status, by } });
  return getGuest(eventId, guestId);
}

function sameSnapshot(a: AnswerSnapshot, b: AnswerSnapshot): boolean {
  const menus = (m: MenuCounts) =>
    Object.entries(m)
      .filter(([, n]) => n > 0)
      .sort(([x], [y]) => x.localeCompare(y))
      .join(";");
  return (
    a.status === b.status &&
    a.party_size === b.party_size &&
    a.children_count === b.children_count &&
    (a.no_meal_count ?? 0) === (b.no_meal_count ?? 0) &&
    (a.allergies ?? null) === (b.allergies ?? null) &&
    a.household_names.join("\n") === b.household_names.join("\n") &&
    menus(a.menu_counts) === menus(b.menu_counts)
  );
}

/**
 * Decision 8 for the couple's direct edits — the quick status toggle, the
 * party size in the plain edit, the menu split: `write` runs, and when it
 * changed any answer field the change is kept in the history as the
 * couple's, before → after, like a recorded answer. Returns what `write`
 * returned. The history row is written after the edit itself, so a failure
 * there is logged and does not undo the couple's edit.
 */
export async function trackCoupleEdit<T>(eventId: string, guestId: string, write: () => Promise<T>): Promise<T> {
  const before = await guestSnapshot(guestId);
  const result = await write();
  try {
    const after = await guestSnapshot(guestId);
    if (before && after && !sameSnapshot(before, after)) {
      const { data: guest, error } = await createServiceRoleClient().from("event_guests").select("full_name").eq("id", guestId).single();
      if (error) throw error;
      const confirmed = after.status === "confirmed";
      await insertAnswer({
        eventId,
        guestId,
        source: "couple",
        fullName: guest.full_name,
        phone: null,
        answer: {
          status: after.status as StoredStatus,
          partySize: confirmed ? after.party_size : null,
          childrenCount: confirmed ? after.children_count : 0,
          menuCounts: confirmed ? after.menu_counts : {},
          noMealCount: confirmed ? (after.no_meal_count ?? 0) : 0,
          allergies: confirmed ? after.allergies : null,
          comment: null,
          householdNames: confirmed ? after.household_names : [],
        },
        match: "couple",
        reviewState: "none",
        before,
        after,
      });
    }
  } catch (err) {
    log("error", "couple_edit_history_failed", { event_id: eventId, guest_id: guestId, ...errorFields(err) });
  }
  return result;
}

/** A guest's applied answers, newest first, for "Историја на одговори". */
export async function listGuestAnswerHistory(eventId: string, guestId: string): Promise<GuestAnswerHistoryItem[]> {
  const { data, error } = await createServiceRoleClient()
    .from("event_rsvp_answers")
    .select("id, created_at, source, comment, review_state, before, after")
    .eq("event_id", eventId)
    .eq("guest_id", guestId)
    .in("review_state", ["none", "applied", "linked"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    source: r.source as AnswerSource,
    comment: r.comment,
    ...(r.review_state === "linked" ? { linked: true } : {}),
    before: r.before as AnswerSnapshot | null,
    after: r.after as AnswerSnapshot | null,
  }));
}
