import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { EventLayoutElement } from "@/lib/venue/floorplan";
import { recordAudit } from "@/lib/audit";

// Project A §5: the venue↔couple seating send/approve/reject/counter flow.
// No locking (spec): sending never blocks further edits or further sends,
// so several pending proposals from the same side can coexist.

export type ProposedBy = "venue" | "couple";
export type ProposalStatus = "pending" | "approved" | "rejected" | "superseded";

export interface SeatingProposal {
  id: string;
  event_id: string;
  room_id: string;
  proposed_by: ProposedBy;
  status: ProposalStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  responded_at: string | null;
  responded_by: string | null;
}

interface SeatingProposalRow extends SeatingProposal {
  snapshot: ProposalSnapshot;
}

// Named distinctly from lib/venue/room-presets.ts's own (differently-shaped,
// id-less) SnapshotElement — both are exported, so a shared name would collide.
export type ProposalSnapshotElement = Pick<
  EventLayoutElement,
  "id" | "element_type" | "table_type_id" | "x_cm" | "y_cm" | "width_cm" | "length_cm" | "rotation_deg" | "label" | "group_id" | "table_role" | "shape"
>;
export interface ProposalSnapshot {
  elements: ProposalSnapshotElement[];
}

export class ProposalAlreadyRespondedError extends Error {
  constructor() {
    super("Предлогот веќе е одговорен.");
    this.name = "ProposalAlreadyRespondedError";
  }
}

const PROPOSAL_COLUMNS = "id, event_id, room_id, proposed_by, status, note, created_by, created_at, responded_at, responded_by";

function toSnapshot(elements: EventLayoutElement[]): ProposalSnapshot {
  return {
    elements: elements.map((el) => ({
      id: el.id,
      element_type: el.element_type,
      table_type_id: el.table_type_id,
      x_cm: el.x_cm,
      y_cm: el.y_cm,
      width_cm: el.width_cm,
      length_cm: el.length_cm,
      rotation_deg: el.rotation_deg,
      label: el.label,
      group_id: el.group_id ?? null,
      table_role: el.table_role ?? "guest",
      shape: el.shape ?? null,
    })),
  };
}

export async function listSeatingProposals(
  eventId: string,
  roomId: string,
  client: SupabaseClient = createServiceRoleClient()
): Promise<SeatingProposal[]> {
  const { data, error } = await client
    .from("event_seating_proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("event_id", eventId)
    .eq("room_id", roomId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Sends `elements` to the other side as a new pending proposal. `createdBy` is the manager's name (venue sends) or null (couple sends, no per-organizer identity tracked — same convention as sent_by elsewhere). */
export async function createSeatingProposal(
  eventId: string,
  roomId: string,
  proposedBy: ProposedBy,
  elements: EventLayoutElement[],
  opts: { client?: SupabaseClient; createdBy?: string | null } = {}
): Promise<SeatingProposal> {
  const client = opts.client ?? createServiceRoleClient();
  const { data, error } = await client
    .from("event_seating_proposals")
    .insert({ event_id: eventId, room_id: roomId, proposed_by: proposedBy, snapshot: toSnapshot(elements), created_by: opts.createdBy ?? null })
    .select(PROPOSAL_COLUMNS)
    .single();
  if (error) throw error;

  await notify(client, data, "seating_sent");
  return data;
}

/** Overwrites event_layout_elements with `elements`, ids preserved (so seats attached to unchanged tables stay attached) — the same atomic replace the couple's old direct-confirm used. */
async function applyToLiveLayout(client: SupabaseClient, eventId: string, roomId: string, elements: ProposalSnapshotElement[]): Promise<void> {
  const { error } = await client.rpc("confirm_event_seating", {
    p_event_id: eventId,
    p_room_id: roomId,
    p_elements: elements,
    p_confirmed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Overwrites the organizer's draft for one room, so it matches a layout they just approved instead of looking stale. Direct write (not the CAS-protected draft editor in lib/couple/seating.ts): this is one explicit server action, not a race-prone client edit. */
async function replaceCoupleDraft(client: SupabaseClient, eventId: string, roomId: string, elements: ProposalSnapshotElement[]): Promise<void> {
  const { data, error } = await client.from("events").select("seating_draft").eq("id", eventId).single();
  if (error) throw error;
  const draft = { ...((data.seating_draft as Record<string, unknown>) ?? {}), [roomId]: elements };
  const { error: updateError } = await client.from("events").update({ seating_draft: draft }).eq("id", eventId);
  if (updateError) throw updateError;
}

/** Drops seats whose table left the layout or shrank below the seat number (0070) — same RPC lib/couple/seating.ts's own pruneSeats calls. */
async function pruneSeats(client: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await client.rpc("prune_event_seat_assignments", { p_event_id: eventId });
  if (error) throw error;
}

/**
 * What the live layout should fall back to when a venue-sent proposal is
 * rejected. A venue edit is live the instant staff makes it (§5: "the venue
 * edits it directly before sending"), so there is no separate "before this
 * edit" state to restore — the room's own last agreed state is the nearest
 * well-defined one: the snapshot of the most recently *approved* proposal
 * for this room (excluding the one just rejected), or the event's frozen
 * baseline if nothing has ever been approved for it.
 *
 * Deliberately excludes rejected proposals, even though they're also
 * "resolved": a rejected proposal's snapshot is content that was declined,
 * not a state the room was ever actually left in — rejecting it already
 * restored live to whatever came before it. Falling back to a rejected
 * proposal's own snapshot would resurrect content a previous rejection had
 * already undone (confirmed bug: reject offer A, then reject an unrelated
 * offer B — B's rejection fell back to A's declined snapshot instead of the
 * real baseline, bringing A's rejected tables back).
 */
export async function previousResolvedSnapshot(
  client: SupabaseClient,
  eventId: string,
  roomId: string,
  excludeProposalId: string
): Promise<ProposalSnapshotElement[]> {
  const { data: lastResolved, error } = await client
    .from("event_seating_proposals")
    .select("snapshot")
    .eq("event_id", eventId)
    .eq("room_id", roomId)
    .neq("id", excludeProposalId)
    .eq("status", "approved")
    .order("responded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (lastResolved) return (lastResolved.snapshot as ProposalSnapshot).elements;

  const { data: event, error: eventError } = await client.from("events").select("seating_baseline").eq("id", eventId).single();
  if (eventError) throw eventError;
  const baseline = (event.seating_baseline as Record<string, ProposalSnapshotElement[]> | null) ?? {};
  return baseline[roomId] ?? [];
}

/**
 * Fix #3: the before/after a pending (or already-resolved) proposal
 * represents — "before" is the same room-agreed reference
 * previousResolvedSnapshot already uses as the reject fallback, so the
 * comparison is always against the last thing both sides actually agreed
 * to, not just whatever happened to be live when the proposal was sent.
 */
export async function getSeatingProposalDiff(
  proposalId: string,
  client: SupabaseClient = createServiceRoleClient()
): Promise<{ before: ProposalSnapshotElement[]; after: ProposalSnapshotElement[] }> {
  const { data, error } = await client
    .from("event_seating_proposals")
    .select("event_id, room_id, snapshot")
    .eq("id", proposalId)
    .single();
  if (error) throw error;
  const row = data as { event_id: string; room_id: string; snapshot: ProposalSnapshot };
  const before = await previousResolvedSnapshot(client, row.event_id, row.room_id, proposalId);
  return { before, after: row.snapshot.elements };
}

/**
 * Approves a pending proposal. A couple-sent proposal becomes the live
 * layout (event_layout_elements). A venue-sent proposal is already live
 * (the venue edits it directly before sending) — approving just
 * acknowledges it and syncs the couple's own draft to match. Either way,
 * every other still-pending proposal for the same event+room is marked
 * `superseded` — the layout has moved on, so an older pending proposal is
 * no longer actionable.
 */
export async function approveSeatingProposal(
  proposalId: string,
  respondedBy: string | null,
  client: SupabaseClient = createServiceRoleClient()
): Promise<SeatingProposal> {
  const { data: proposal, error } = await client
    .from("event_seating_proposals")
    .select(`${PROPOSAL_COLUMNS}, snapshot`)
    .eq("id", proposalId)
    .single();
  if (error) throw error;
  const row = proposal as SeatingProposalRow;
  if (row.status !== "pending") throw new ProposalAlreadyRespondedError();

  if (row.proposed_by === "couple") {
    await applyToLiveLayout(client, row.event_id, row.room_id, row.snapshot.elements);
  } else {
    await replaceCoupleDraft(client, row.event_id, row.room_id, row.snapshot.elements);
  }

  const { data: updated, error: updateError } = await client
    .from("event_seating_proposals")
    .update({ status: "approved", responded_at: new Date().toISOString(), responded_by: respondedBy })
    .eq("id", proposalId)
    .select(PROPOSAL_COLUMNS)
    .single();
  if (updateError) throw updateError;

  const { error: supersedeError } = await client
    .from("event_seating_proposals")
    .update({ status: "superseded" })
    .eq("event_id", row.event_id)
    .eq("room_id", row.room_id)
    .eq("status", "pending");
  if (supersedeError) throw supersedeError;

  await notify(client, updated, "seating_approved");
  return updated;
}

export async function rejectSeatingProposal(
  proposalId: string,
  respondedBy: string | null,
  note: string | null,
  client: SupabaseClient = createServiceRoleClient()
): Promise<SeatingProposal> {
  const { data: current, error: readError } = await client
    .from("event_seating_proposals")
    .select("event_id, room_id, proposed_by, status")
    .eq("id", proposalId)
    .single();
  if (readError) throw readError;
  if (current.status !== "pending") throw new ProposalAlreadyRespondedError();

  // A venue-sent proposal is already live by the time it's rejected (§5) —
  // rejecting it must undo that edit, not just record a status next to a
  // layout the couple just said no to.
  if (current.proposed_by === "venue") {
    const restore = await previousResolvedSnapshot(client, current.event_id, current.room_id, proposalId);
    await applyToLiveLayout(client, current.event_id, current.room_id, restore);
    await pruneSeats(client, current.event_id);
  }

  const { data, error } = await client
    .from("event_seating_proposals")
    .update({ status: "rejected", note, responded_at: new Date().toISOString(), responded_by: respondedBy })
    .eq("id", proposalId)
    .select(PROPOSAL_COLUMNS)
    .single();
  if (error) throw error;

  await notify(client, data, "seating_rejected");
  return data;
}

/** Venue-facing (audit_log → Известувања, manager-attributed like every other gated action) and couple-facing notifications both read from event_seating_proposals directly, so this only needs to tell the venue side — see lib/couple/notifications.ts for the couple's read side. */
async function notify(client: SupabaseClient, proposal: SeatingProposal, action: "seating_sent" | "seating_approved" | "seating_rejected"): Promise<void> {
  const { data: event } = await client.from("events").select("venue_id").eq("id", proposal.event_id).maybeSingle();
  if (!event) return;
  // Only tell the venue when the couple acted; the venue already knows
  // what it just did (0133's own manager_name covers venue-initiated rows
  // in the audit trail, but a notification about your own action is noise).
  if (action === "seating_sent" && proposal.proposed_by === "venue") return;
  if ((action === "seating_approved" || action === "seating_rejected") && proposal.responded_by !== null) return;
  await recordAudit({
    action,
    actorType: "couple",
    venueId: event.venue_id as string,
    eventId: proposal.event_id,
    targetId: proposal.id,
  });
}
