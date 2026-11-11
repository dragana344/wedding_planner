"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VENUE_TIME_ZONE } from "@/lib/date";
import { FloorPlanCanvas, PX_PER_CM, type CanvasElement, type CanvasGroup } from "./FloorPlanCanvas";
import { fitZoom } from "@/lib/seating/zoom-to-fit";
import {
  FIXED_TYPE_COLORS,
  MOVABLE_TYPE_COLORS,
  FIXED_LABELS,
  MOVABLE_LABELS,
  TABLE_ROLE_LABELS,
  COUPLE_TABLE_COLOR,
  CREW_TABLE_COLOR,
  type TableRole,
  type FixedElement,
  type EventLayoutElement,
  type EventLayoutElementInput,
  type LayoutElementType,
} from "@/lib/venue/floorplan";
import { type Room, type TableType } from "@/lib/venue/rooms";
import { TableSeatsPanel } from "@/components/seating/TableSeatsPanel";
import { GuestRail } from "@/components/seating/GuestRail";
import { AllTablesView } from "@/components/seating/AllTablesView";
import { ToolbarMenu, type ToolbarMenuItem } from "@/components/seating/ToolbarMenu";
import { PrinterIcon, QrIcon, SprigIcon } from "@/components/seating/couple-icons";
import "@/components/seating/couple-seating.css";
import { Icon } from "@/components/venue/shell/Icon";
import { occupancyOf, OCCUPANCY_COLORS, OCCUPANCY_LABELS, type Occupancy } from "@/lib/seating/occupancy";
import { tableTitle, type RoomSeating, type SeatInput } from "@/lib/seating/types";
import { errorMessage } from "@/lib/venue/user-error";
import { openSpot } from "@/lib/venue/open-spot";
import type { SeatingProposalView } from "@/lib/seating/types";
import type { RoomPreset } from "@/lib/venue/room-presets";
import type { ProposalSnapshotElement } from "@/lib/seating/proposals";
import { diffProposalElements } from "@/lib/seating/proposal-diff";

const PALETTE_BUTTON_CLASS =
  "rounded-full border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-lilac-dark hover:text-lilac-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-neutral-700";

// timeZone and hourCycle are explicit: Node and browsers don't agree on
// mk-MK's default (24h vs AM/PM) or on the local time zone, which breaks
// hydration on this SSR'd proposal summary otherwise.
function formatProposalDate(iso: string): string {
  return new Date(iso).toLocaleString("mk-MK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: VENUE_TIME_ZONE });
}

/** Project A §5: one line summarising a proposal for either side's list. */
function proposalSummary(p: SeatingProposalView): string {
  const from = p.proposed_by === "venue" ? "Салата" : "Парот";
  if (p.status === "pending") return `${from} испрати распоред на ${formatProposalDate(p.created_at)}.`;
  const who = p.responded_by ? ` (${p.responded_by})` : "";
  if (p.status === "approved") return `Распоред од ${from.toLowerCase()} одобрен${who} на ${formatProposalDate(p.responded_at!)}.`;
  if (p.status === "rejected") {
    const reason = p.note?.trim() ? ` — „${p.note.trim()}“` : "";
    return `Распоред од ${from.toLowerCase()} одбиен${who} на ${formatProposalDate(p.responded_at!)}.${reason}`;
  }
  return `Распоред од ${from.toLowerCase()} од ${formatProposalDate(p.created_at)} (застарен).`;
}

export interface SeatingActions {
  listFixedElements: (roomId: string) => Promise<FixedElement[]>;
  listLayoutElements: (eventId: string, roomId: string) => Promise<EventLayoutElement[]>;
  initializeFromStandard: (eventId: string, roomId: string) => Promise<EventLayoutElement[]>;
  addElement: (input: EventLayoutElementInput) => Promise<EventLayoutElement>;
  moveElement: (id: string, xCm: number, yCm: number) => Promise<EventLayoutElement>;
  resizeElement: (id: string, widthCm: number, lengthCm: number) => Promise<EventLayoutElement>;
  rotateElement: (id: string, rotationDeg: number) => Promise<EventLayoutElement>;
  /** Free table label, e.g. "Кумови" or "12" (B4). Null clears it back to "Маса N". */
  relabelElement?: (id: string, label: string | null) => Promise<EventLayoutElement>;
  deleteElement: (id: string) => Promise<void>;
  revertToStandard: (eventId: string, roomId: string) => Promise<EventLayoutElement[]>;
  /** Venue only: a manual escape hatch alongside "revert to standard" —
   * swaps this event's room layout for a copy of one of the room's saved
   * presets (Распоред на маси → room → "Уреди распоред на масите"). */
  listPresets?: (roomId: string) => Promise<RoomPreset[]>;
  loadPreset?: (eventId: string, roomId: string, presetId: string) => Promise<EventLayoutElement[]>;
  captureSnapshot: (eventId: string, roomId: string) => Promise<void>;
  undo: (eventId: string, roomId: string) => Promise<EventLayoutElement[]>;
  /** Organizer-only: when present, this editor is working on a private draft
   * rather than the shared live layout, and the confirm toggle renders.
   * Absent for staff, whose edits stay live and unaffected either way. */
  getConfirmedAt?: (eventId: string, roomId: string) => Promise<string | null>;
  /** Couple only: sends the current draft to the venue as a pending proposal (Project A §5). */
  confirm?: (eventId: string, roomId: string) => Promise<void>;
  unconfirm?: (eventId: string, roomId: string) => Promise<void>;
  /** Couple only: copies the event's frozen baseline (§3) into the draft. */
  resetToBaseline?: (eventId: string, roomId: string) => Promise<EventLayoutElement[]>;
  /** Venue only: sends the current live layout to the couple as a pending proposal (§5). */
  sendProposal?: (eventId: string, roomId: string) => Promise<SeatingProposalView>;
  /** Both sides: list this room's send/approve/reject history (§5). */
  listProposals?: (eventId: string, roomId: string) => Promise<SeatingProposalView[]>;
  approveProposal?: (proposalId: string) => Promise<void>;
  rejectProposal?: (proposalId: string, note: string | null) => Promise<void>;
  /** Fix #3: the before/after a proposal represents, for the two small
   * floor-plan previews on its row. Absent: no "Прегледај промени" toggle. */
  getProposalDiff?: (proposalId: string) => Promise<{ before: ProposalSnapshotElement[]; after: ProposalSnapshotElement[] }>;
  /** Multi-step history (0072). Absent: only the single legacy undo. */
  redo?: (eventId: string, roomId: string) => Promise<EventLayoutElement[]>;
  getHistoryState?: (eventId: string, roomId: string) => Promise<{ canUndo: boolean; canRedo: boolean }>;
  /** Table groups (B3): returns the room's elements afterwards. */
  group?: (eventId: string, roomId: string, elementIds: string[]) => Promise<EventLayoutElement[]>;
  ungroup?: (eventId: string, roomId: string, groupId: string) => Promise<EventLayoutElement[]>;
  /** Seat lists per table (S3). Absent: no seat panel. */
  getRoomSeating?: (eventId: string, roomId: string) => Promise<RoomSeating>;
  /** Couple only: replaces one table's list and returns the room's fresh seating. */
  saveTableSeats?: (roomId: string, elementId: string, seats: SeatInput[], expected: SeatInput[]) => Promise<RoomSeating>;
  /** Couple only: the guest rail's drag-and-drop — assigns (no `from`) or moves
   * (with `from`) one guest to one seat, atomically. Returns the room's fresh seating. */
  moveSeat?: (
    roomId: string,
    guestId: string,
    to: { elementId: string; seatNumber: number },
    from?: { elementId: string; seatNumber: number },
  ) => Promise<RoomSeating>;
}

export function EventSeatingPage({
  eventId,
  eventName,
  room,
  initialFixedElements,
  initialLayoutElements,
  initialTableTypes,
  actions,
  skipInitialization = false,
  backHref = "/venue/events",
  backLabel = "← Назад кон настани",
  onBack,
  initialSeating,
  seatingReadOnly = false,
  viewOnly = false,
  viewOnlyNotice,
  printLinks,
  guestCountEstimate = null,
  logoUrl = null,
  look = "venue",
}: {
  eventId: string;
  eventName: string;
  room: Room;
  initialFixedElements: FixedElement[];
  initialLayoutElements: EventLayoutElement[];
  initialTableTypes: TableType[];
  actions: SeatingActions;
  skipInitialization?: boolean;
  backHref?: string;
  backLabel?: string;
  /** When rendered inside an overlay rather than a routed page, closing it is
   * an in-place state change, not a navigation — pass this instead of relying
   * on backHref/backLabel, which render a real <Link> otherwise. */
  onBack?: () => void;
  initialSeating?: RoomSeating;
  /** Venue staff see the lists but cannot edit them (they cannot read the guest list). */
  seatingReadOnly?: boolean;
  /** Look-only: every element stays put and every editing tool is hidden
   * (venue staff without a manager login, past events). Seat lists are
   * read-only too. Zoom, "Сите маси" and printing still work. */
  viewOnly?: boolean;
  /** Shown above the plan while `viewOnly`, saying why it can't be edited. */
  viewOnlyNotice?: string;
  /** B7: the printable A4 plan and per-table QR cards. */
  printLinks?: { plan: string; qr?: string };
  /** Project A §6: flags when it exceeds this room's current seat capacity. */
  guestCountEstimate?: number | null;
  /** Project C: the venue's own logo, watermarked over the floor plan. */
  logoUrl?: string | null;
  /** "couple": the couple panel's ivory/gold page — title header, one
   * toolbar with drop-down menus, plan card and a Гости / Детали за маса
   * sidebar (couple-seating.css). Same actions and behaviour either way. */
  look?: "venue" | "couple";
}) {
  const [fixedElements] = useState(initialFixedElements);
  const [layoutElements, setLayoutElements] = useState(initialLayoutElements);
  const [tableTypes] = useState(initialTableTypes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResettingBaseline, setIsResettingBaseline] = useState(false);
  const [proposals, setProposals] = useState<SeatingProposalView[]>([]);
  const [isSendingProposal, setIsSendingProposal] = useState(false);
  const [respondingProposalId, setRespondingProposalId] = useState<string | null>(null);
  const [rejectingProposalId, setRejectingProposalId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showPastProposals, setShowPastProposals] = useState(false);
  // Fix #3: which proposal's before/after preview is expanded, and what's
  // been loaded for it so far — fetched once per proposal, not on every render.
  const [expandedDiffId, setExpandedDiffId] = useState<string | null>(null);
  const [proposalDiffs, setProposalDiffs] = useState<
    Record<string, { before: ProposalSnapshotElement[]; after: ProposalSnapshotElement[] } | "loading" | "error">
  >({});
  const [seating, setSeating] = useState<RoomSeating | null>(initialSeating ?? null);
  // "Листа на маси": on the venue look the lists open under the plan; on the
  // couple look they replace the plan and sidebar (План / Листа is a switch).
  const [showAllTables, setShowAllTables] = useState(false);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [isRedoing, setIsRedoing] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupPick, setGroupPick] = useState<string[]>([]);
  const [presets, setPresets] = useState<RoomPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [sideTab, setSideTab] = useState<"guests" | "table">("guests");
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  // Project C: a wide room starts zoomed to fit the visible width instead of
  // overflowing into a horizontal scrollbar at 100% — once per room, not a
  // live resize behaviour; the manual +/- buttons still work from there.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    setZoom(fitZoom(room.width_cm, PX_PER_CM, el.clientWidth));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);
  // A refused save (e.g. another device saved first) reloads the list and says why.
  const [seatNotice, setSeatNotice] = useState<string | null>(null);
  const [seatVersion, setSeatVersion] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // The guest rail's drag-and-drop (fix #2): the id of the guest currently
  // being dragged from the "Гости" list, or null. Cleared on any pointer
  // release, dropped on a seat or not — see the window listener below.
  const [draggingGuestId, setDraggingGuestId] = useState<string | null>(null);
  useEffect(() => {
    if (!draggingGuestId) return;
    const end = () => setDraggingGuestId(null);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [draggingGuestId]);

  async function refreshHistory() {
    if (actions.getHistoryState) setHistory(await actions.getHistoryState(eventId, room.id));
  }

  async function refreshProposals() {
    if (actions.listProposals) setProposals(await actions.listProposals(eventId, room.id));
  }

  async function refreshPresets() {
    if (actions.listPresets) setPresets(await actions.listPresets(room.id));
  }

  async function refresh() {
    setLayoutElements(await actions.listLayoutElements(eventId, room.id));
    await refreshHistory();
    // Layout edits add, drop or shrink tables; the server prunes seats.
    if (actions.getRoomSeating) setSeating(await actions.getRoomSeating(eventId, room.id));
  }

  function seatedAt(elementId: string): number {
    return seating?.seats.filter((s) => s.elementId === elementId).length ?? 0;
  }

  const selectedSeatTable = seating?.tables.find((t) => t.elementId === selectedId) ?? null;
  const selectedTable = layoutElements.find((el) => el.id === selectedId && el.element_type === "table") ?? null;

  // Guards against React StrictMode's dev-only double-invocation of this
  // effect: without this, initializeEventLayoutFromStandard's list-then-insert
  // can run twice concurrently before either write completes, silently
  // duplicating every copied-in standard element. Keyed by eventId+room.id so
  // a genuine room switch still re-initializes. (Carried over from the
  // original floor-plan-builder plan's live-verification fix.)
  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${eventId}:${room.id}`;
    if (initializedKeyRef.current === key) return;
    initializedKeyRef.current = key;
    setSelectedPresetId("");
    if (skipInitialization) {
      setCanUndo(true);
      refreshHistory();
      refreshProposals();
      refreshPresets();
      return;
    }
    (async () => {
      const initial = await actions.initializeFromStandard(eventId, room.id);
      setLayoutElements(initial);
      await actions.captureSnapshot(eventId, room.id);
      setCanUndo(true);
      await refreshHistory();
      await refreshProposals();
      await refreshPresets();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, room.id]);

  // Project A §3: couple-only — copies the event's frozen baseline into the draft.
  async function handleResetToBaseline() {
    if (!actions.resetToBaseline) return;
    if (!window.confirm("Да се врати распоредот на првично договорениот? Вашите последни промени во нацрт-распоредот ќе се изгубат (можете да ги вратите со „← Врати“).")) return;
    setError(null);
    setIsResettingBaseline(true);
    try {
      setLayoutElements(await actions.resetToBaseline(eventId, room.id));
      await refreshHistory();
      if (actions.getRoomSeating) setSeating(await actions.getRoomSeating(eventId, room.id));
    } catch (err) {
      setError(errorMessage(err, "Не успеа враќањето на првичниот распоред. Обидете се повторно."));
    } finally {
      setIsResettingBaseline(false);
    }
  }

  // Project A §5: either side sends its current working copy (couple: draft
  // via actions.confirm; venue: live layout via actions.sendProposal) as a
  // new pending proposal for the other side to review.
  async function handleSendProposal() {
    setError(null);
    setIsSendingProposal(true);
    try {
      if (actions.confirm) {
        await actions.confirm(eventId, room.id);
      } else if (actions.sendProposal) {
        await actions.sendProposal(eventId, room.id);
      }
      await refreshProposals();
    } catch (err) {
      setError(errorMessage(err, "Не успеа испраќањето на распоредот. Обидете се повторно."));
    } finally {
      setIsSendingProposal(false);
    }
  }

  async function handleApproveProposal(proposalId: string) {
    if (!actions.approveProposal) return;
    setError(null);
    setRespondingProposalId(proposalId);
    try {
      await actions.approveProposal(proposalId);
      await refresh();
      await refreshProposals();
    } catch (err) {
      setError(errorMessage(err, "Не успеа одобрувањето на распоредот. Обидете се повторно."));
    } finally {
      setRespondingProposalId(null);
    }
  }

  async function handleRejectProposal(proposalId: string) {
    if (!actions.rejectProposal) return;
    setError(null);
    setRespondingProposalId(proposalId);
    try {
      await actions.rejectProposal(proposalId, rejectNote.trim() || null);
      setRejectingProposalId(null);
      setRejectNote("");
      await refreshProposals();
    } catch (err) {
      setError(errorMessage(err, "Не успеа одбивањето на распоредот. Обидете се повторно."));
    } finally {
      setRespondingProposalId(null);
    }
  }

  async function handleToggleProposalDiff(proposalId: string) {
    if (expandedDiffId === proposalId) {
      setExpandedDiffId(null);
      return;
    }
    setExpandedDiffId(proposalId);
    if (!actions.getProposalDiff || proposalDiffs[proposalId]) return;
    setProposalDiffs((prev) => ({ ...prev, [proposalId]: "loading" }));
    try {
      const diff = await actions.getProposalDiff(proposalId);
      setProposalDiffs((prev) => ({ ...prev, [proposalId]: diff }));
    } catch {
      setProposalDiffs((prev) => ({ ...prev, [proposalId]: "error" }));
    }
  }

  /** Fix #3: a proposal's before/after snapshot rendered as a small, static
   * floor plan — mode="select" with nothing ever in selectedIds means the
   * canvas never starts a drag, so this stays inert regardless of pointer
   * events. Elements that differ from the other side are gold-highlighted. */
  function diffCanvasElements(elements: ProposalSnapshotElement[], highlighted: Set<string>): CanvasElement[] {
    return elements.map((el) => {
      const tableType = el.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : null;
      const role = el.table_role ?? "guest";
      const shape: "rect" | "circle" =
        el.element_type === "table"
          ? tableType?.shape === "rectangular"
            ? "rect"
            : "circle"
          : el.shape === "round"
            ? "circle"
            : "rect";
      return {
        id: el.id,
        x_cm: el.x_cm,
        y_cm: el.y_cm,
        width_cm: el.width_cm,
        height_cm: el.length_cm,
        color:
          el.element_type === "table" && role === "couple"
            ? COUPLE_TABLE_COLOR
            : el.element_type === "table" && role === "crew"
              ? CREW_TABLE_COLOR
              : MOVABLE_TYPE_COLORS[el.element_type],
        label: el.element_type === "table" && role !== "guest" ? (el.label ?? TABLE_ROLE_LABELS[role]) : (el.label ?? MOVABLE_LABELS[el.element_type]),
        shape,
        rotationDeg: el.rotation_deg,
        locked: true,
        highlighted: highlighted.has(el.id),
        seatCount: el.element_type === "table" ? tableType?.seats : undefined,
      };
    });
  }

  function tablesPlacedForType(tableTypeId: string): number {
    return layoutElements.filter((el) => el.element_type === "table" && el.table_type_id === tableTypeId).length;
  }

  const seatedCount = layoutElements
    .filter((el) => el.element_type === "table")
    .reduce((sum, el) => {
      const tableType = el.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : null;
      return sum + (tableType?.seats ?? 0);
    }, 0);

  async function handleAddMovable(type: LayoutElementType) {
    setError(null);
    try {
      const created = await actions.addElement({
        event_id: eventId,
        room_id: room.id,
        element_type: type,
        ...openSpot(
          { x_cm: Math.max(0, (room.width_cm - 200) / 2), y_cm: Math.max(0, (room.height_cm - 150) / 2) },
          { width_cm: 200, length_cm: 150 },
          { width_cm: room.width_cm, height_cm: room.height_cm },
          [...fixedElements, ...layoutElements],
        ),
        width_cm: 200,
        length_cm: 150,
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(errorMessage(err, "Не успеа додавањето на елементот. Обидете се повторно."));
    }
  }

  /** Couple / head tables use a rectangular table type when the room has one. */
  const specialTableType = tableTypes.find((tt) => tt.shape === "rectangular") ?? tableTypes[0] ?? null;

  async function handleAddSpecialTable(role: Exclude<TableRole, "guest">) {
    if (!specialTableType) return;
    setError(null);
    try {
      const created = await actions.addElement({
        event_id: eventId,
        room_id: room.id,
        element_type: "table",
        table_type_id: specialTableType.id,
        table_role: role,
        ...openSpot(
          { x_cm: Math.max(0, (room.width_cm - specialTableType.width_cm) / 2), y_cm: 100 },
          { width_cm: specialTableType.width_cm, length_cm: specialTableType.length_cm },
          { width_cm: room.width_cm, height_cm: room.height_cm },
          [...fixedElements, ...layoutElements],
        ),
        width_cm: specialTableType.width_cm,
        length_cm: specialTableType.length_cm,
        label: null,
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(errorMessage(err, "Не успеа додавањето на масата. Обидете се повторно."));
    }
  }

  async function handleRelabel(id: string, label: string) {
    if (!actions.relabelElement) return;
    setError(null);
    try {
      await actions.relabelElement(id, label.trim() || null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Не успеа зачувувањето на ознаката."));
    }
  }

  /**
   * A guest rail chip dropped onto seat `seatNumber` of the selected table.
   * Already fully seated (held party_size reached) → moves their first
   * existing seat here; otherwise just assigns this seat on top of what they
   * already hold (a bigger party placed one seat at a time).
   */
  async function handleDropGuest(seatNumber: number) {
    const guestId = draggingGuestId;
    setDraggingGuestId(null);
    if (!guestId || !actions.moveSeat || !selectedSeatTable || !seating) return;
    const guest = seating.guests.find((g) => g.id === guestId);
    const existing = seating.seats.filter((s) => s.guestId === guestId);
    const from =
      guest && existing.length >= guest.partySize
        ? { elementId: existing[0].elementId, seatNumber: existing[0].seatNumber }
        : undefined;
    if (from && from.elementId === selectedSeatTable.elementId && from.seatNumber === seatNumber) return;
    setSeatNotice(null);
    try {
      setSeating(await actions.moveSeat(room.id, guestId, { elementId: selectedSeatTable.elementId, seatNumber }, from));
      // The open list keeps its own rows; remount it so the new guest shows.
      setSeatVersion((v) => v + 1);
      await refreshHistory();
    } catch (err) {
      if (actions.getRoomSeating) setSeating(await actions.getRoomSeating(eventId, room.id));
      setSeatVersion((v) => v + 1);
      setSeatNotice(errorMessage(err, "Не успеа преместувањето на гостинот."));
    }
  }

  async function handleAddTable(tableType: TableType) {
    setError(null);
    if (tablesPlacedForType(tableType.id) >= tableType.quantity) {
      setError(`Сите маси од тип „${tableType.name}“ се веќе поставени.`);
      return;
    }
    try {
      const created = await actions.addElement({
        event_id: eventId,
        room_id: room.id,
        element_type: "table",
        table_type_id: tableType.id,
        ...openSpot(
          { x_cm: Math.max(0, (room.width_cm - tableType.width_cm) / 2), y_cm: Math.max(0, (room.height_cm - tableType.length_cm) / 2) },
          { width_cm: tableType.width_cm, length_cm: tableType.length_cm },
          { width_cm: room.width_cm, height_cm: room.height_cm },
          [...fixedElements, ...layoutElements],
        ),
        width_cm: tableType.width_cm,
        length_cm: tableType.length_cm,
        label: null,
        table_role: "guest",
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(errorMessage(err, "Не успеа додавањето на масата. Обидете се повторно."));
    }
  }

  async function handleMoveEnd(id: string, xCm: number, yCm: number) {
    if (fixedElements.some((el) => el.id === id)) return;
    setError(null);
    try {
      await actions.moveElement(id, xCm, yCm);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Не успеа поместувањето на елементот. Обидете се повторно."));
    }
  }

  async function handleResizeEnd(id: string, widthCm: number, heightCm: number) {
    if (fixedElements.some((el) => el.id === id)) return;
    setError(null);
    try {
      await actions.resizeElement(id, widthCm, heightCm);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Не успеа менувањето на големината на елементот. Обидете се повторно."));
    }
  }

  async function handleDelete(id: string) {
    if (fixedElements.some((el) => el.id === id)) return;
    const seated = seatedAt(id);
    if (seated > 0 && !window.confirm(`Масата има ${seated} седнати гости. Нивните места ќе се ослободат.`)) return;
    setError(null);
    try {
      await actions.deleteElement(id);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Не успеа бришењето на елементот. Обидете се повторно."));
    }
  }

  async function handleRotateEnd(id: string, rotationDeg: number) {
    if (fixedElements.some((el) => el.id === id)) return;
    setError(null);
    try {
      await actions.rotateElement(id, rotationDeg);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Не успеа ротирањето на елементот. Обидете се повторно."));
    }
  }

  async function handleRevert() {
    const seated = seating?.seats.length ?? 0;
    // Standard tables get fresh ids, so every seat in the hall is freed (undo restores them).
    if (seated > 0 && !window.confirm(`Стандардниот распоред ги ослободува сите места во салата (${seated} седнати гости). Можете да ги вратите со „← Врати“.`)) return;
    setError(null);
    try {
      await actions.revertToStandard(eventId, room.id);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Не успеа враќањето на стандардниот распоред. Обидете се повторно."));
    }
  }

  async function handleLoadPreset() {
    if (!actions.loadPreset || !selectedPresetId) return;
    const seated = seating?.seats.length ?? 0;
    const presetName = presets.find((p) => p.id === selectedPresetId)?.name ?? "";
    if (
      !window.confirm(
        `Да се примени планот „${presetName}“? Моменталниот распоред за оваа сала ќе биде заменет.${
          seated > 0 ? ` Сите седнати гости (${seated}) ќе се ослободат.` : ""
        } Можете да се вратите со „← Врати“.`,
      )
    )
      return;
    setError(null);
    setIsLoadingPreset(true);
    try {
      setLayoutElements(await actions.loadPreset(eventId, room.id, selectedPresetId));
      setSelectedId(null);
      await refreshHistory();
      if (actions.getRoomSeating) setSeating(await actions.getRoomSeating(eventId, room.id));
    } catch (err) {
      setError(errorMessage(err, "Не успеа примената на планот. Обидете се повторно."));
    } finally {
      setIsLoadingPreset(false);
    }
  }

  async function handleUndo() {
    if (isUndoing) return;
    setError(null);
    setIsUndoing(true);
    try {
      await actions.undo(eventId, room.id);
      if (!actions.getHistoryState) setCanUndo(false);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Нема што да се врати."));
    } finally {
      setIsUndoing(false);
    }
  }

  async function handleRedo() {
    if (isRedoing || !actions.redo) return;
    setError(null);
    setIsRedoing(true);
    try {
      await actions.redo(eventId, room.id);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Нема што да се повтори."));
    } finally {
      setIsRedoing(false);
    }
  }

  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, except while typing in a field.
  const undoRef = useRef(handleUndo);
  const redoRef = useRef(handleRedo);
  useEffect(() => {
    undoRef.current = handleUndo;
    redoRef.current = handleRedo;
  });
  useEffect(() => {
    if (!actions.getHistoryState || viewOnly) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redoRef.current();
      else undoRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions.getHistoryState, viewOnly]);

  function toggleGroupPick(id: string) {
    const el = layoutElements.find((e) => e.id === id);
    if (!el || el.element_type !== "table") return;
    setGroupPick((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleGroup() {
    if (!actions.group || groupPick.length < 2) return;
    setError(null);
    try {
      setLayoutElements(await actions.group(eventId, room.id, groupPick));
      setGroupMode(false);
      setGroupPick([]);
      await refreshHistory();
    } catch (err) {
      setError(errorMessage(err, "Не успеа групирањето на масите."));
    }
  }

  async function handleUngroup(groupId: string) {
    if (!actions.ungroup) return;
    setError(null);
    try {
      setLayoutElements(await actions.ungroup(eventId, room.id, groupId));
      await refreshHistory();
    } catch (err) {
      setError(errorMessage(err, "Не успеа разгрупирањето."));
    }
  }

  const selectedGroupId = layoutElements.find((el) => el.id === selectedId)?.group_id ?? null;

  function seatsOf(el: EventLayoutElement): number {
    const fromSeating = seating?.tables.find((t) => t.elementId === el.id)?.capacity;
    if (fromSeating !== undefined) return fromSeating;
    return tableTypes.find((tt) => tt.id === el.table_type_id)?.seats ?? 0;
  }

  const groupOutlines: CanvasGroup[] = Object.entries(
    layoutElements.reduce<Record<string, EventLayoutElement[]>>((acc, el) => {
      if (el.group_id) (acc[el.group_id] ??= []).push(el);
      return acc;
    }, {}),
  ).map(([id, members]) => {
    const x = Math.min(...members.map((m) => m.x_cm));
    const y = Math.min(...members.map((m) => m.y_cm));
    return {
      id,
      x_cm: x,
      y_cm: y,
      width_cm: Math.max(...members.map((m) => m.x_cm + m.width_cm)) - x,
      height_cm: Math.max(...members.map((m) => m.y_cm + m.length_cm)) - y,
      label: `Група · ${members.reduce((sum, m) => sum + seatsOf(m), 0)} места`,
    };
  });

  const canvasElements: CanvasElement[] = [
    ...fixedElements.map((el) => ({
      id: el.id,
      x_cm: el.x_cm,
      y_cm: el.y_cm,
      width_cm: el.width_cm,
      height_cm: el.height_cm,
      color: FIXED_TYPE_COLORS[el.element_type],
      label: el.label ?? FIXED_LABELS[el.element_type],
      shape: "rect" as const,
      locked: true,
      rotationDeg: el.rotation_deg,
    })),
    ...layoutElements.map((el) => {
      const tableType = el.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : null;
      const seatTable = seating?.tables.find((t) => t.elementId === el.id);
      const occupancy = seatTable ? occupancyOf(seatTable.capacity, seatedAt(el.id)) : undefined;
      const shape: "rect" | "circle" =
        el.element_type === "table"
          ? tableType?.shape === "rectangular"
            ? "rect"
            : "circle"
          : el.shape === "round"
            ? "circle"
            : "rect";
      const role = el.table_role ?? "guest";
      const label = seatTable
        ? tableTitle(seatTable)
        : el.element_type === "table" && role !== "guest"
          ? (el.label ?? TABLE_ROLE_LABELS[role])
          : (el.label ?? MOVABLE_LABELS[el.element_type]);
      return {
        id: el.id,
        x_cm: el.x_cm,
        y_cm: el.y_cm,
        width_cm: el.width_cm,
        height_cm: el.length_cm,
        color:
          el.element_type === "table" && role === "couple"
            ? COUPLE_TABLE_COLOR
            : el.element_type === "table" && role === "crew"
              ? CREW_TABLE_COLOR
              : occupancy
                ? OCCUPANCY_COLORS[occupancy]
                : MOVABLE_TYPE_COLORS[el.element_type],
        occupancy,
        badge: seatTable ? `${seatedAt(el.id)}/${seatTable.capacity}` : undefined,
        label,
        shape,
        rotationDeg: el.rotation_deg,
        locked: viewOnly,
        highlighted: showAllTables && el.id === highlightedId,
        seatCount: el.element_type === "table" ? tableType?.seats : undefined,
      };
    }),
  ];

  // Project A §5: the room's send/approve/reject history, shared by both looks.
  // Fix #3: a fixed small thumbnail width for the before/after preview panes,
  // whatever the room's actual size — fitZoom already does exactly this for
  // the main canvas, just with a much lower floor than its 0.5 default.
  const diffZoom = fitZoom(room.width_cm, PX_PER_CM, 220, 0.1);

  // Waiting proposals always show; answered/outdated ones collapse behind a
  // toggle so many back-and-forth sends don't grow into a long list.
  const pendingProposals = proposals.filter((p) => p.status === "pending");
  const pastProposals = proposals.filter((p) => p.status !== "pending");
  const proposalList = (list: SeatingProposalView[]) => (
    <ul className="space-y-1.5">
      {list.map((p) => {
        const incoming = p.status === "pending" && p.proposed_by !== (actions.confirm ? "couple" : "venue");
        return (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2 text-sm text-neutral-700">
            <span>{proposalSummary(p)}</span>
            {incoming && actions.approveProposal ? (
              <button
                type="button"
                onClick={() => handleApproveProposal(p.id)}
                disabled={respondingProposalId === p.id}
                className="rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Одобри
              </button>
            ) : null}
            {incoming && actions.rejectProposal ? (
              rejectingProposalId === p.id ? (
                <>
                  <input
                    type="text"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Причина (опционално)"
                    className="rounded-full border border-neutral-200 px-3 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleRejectProposal(p.id)}
                    disabled={respondingProposalId === p.id}
                    className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Потврди одбивање
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingProposalId(null);
                      setRejectNote("");
                    }}
                    className="text-xs text-neutral-500 underline"
                  >
                    Откажи
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setRejectingProposalId(p.id)}
                  disabled={respondingProposalId === p.id}
                  className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 hover:border-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Одбиј
                </button>
              )
            ) : null}
            {actions.getProposalDiff ? (
              <button
                type="button"
                onClick={() => handleToggleProposalDiff(p.id)}
                aria-expanded={expandedDiffId === p.id}
                className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 hover:border-lilac-dark hover:text-lilac-dark"
              >
                {expandedDiffId === p.id ? "Сокриј промени" : "Прегледај промени"}
              </button>
            ) : null}
            {expandedDiffId === p.id ? (
              <div className="w-full">
                {proposalDiffs[p.id] === "loading" ? (
                  <p className="text-xs text-neutral-500">Се вчитува...</p>
                ) : proposalDiffs[p.id] === "error" ? (
                  <p className="text-xs text-red-600">Не успеа вчитувањето на промените.</p>
                ) : proposalDiffs[p.id] ? (
                  (() => {
                    const diff = proposalDiffs[p.id] as { before: ProposalSnapshotElement[]; after: ProposalSnapshotElement[] };
                    const { beforeHighlighted, afterHighlighted } = diffProposalElements(diff.before, diff.after);
                    const panes = [
                      ["Пред", diff.before, beforeHighlighted],
                      ["Предложено", diff.after, afterHighlighted],
                    ] as const;
                    return (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {panes.map(([title, elements, highlighted]) => (
                          <div key={title} className="rounded-xl border border-neutral-200 bg-neutral-50 p-2">
                            <p className="mb-1 text-xs font-medium text-neutral-500">{title}</p>
                            <FloorPlanCanvas
                              widthCm={room.width_cm}
                              heightCm={room.height_cm}
                              elements={diffCanvasElements(elements, highlighted)}
                              selectedElementId={null}
                              onSelect={() => {}}
                              onMoveEnd={() => {}}
                              onResizeEnd={() => {}}
                              onRotateEnd={() => {}}
                              onDelete={() => {}}
                              mode="select"
                              selectedIds={[]}
                              zoom={diffZoom}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
  const proposalItems =
    actions.listProposals && proposals.length > 0 ? (
      <div className="space-y-1.5">
        {pendingProposals.length > 0 ? proposalList(pendingProposals) : null}
        {pastProposals.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setShowPastProposals((v) => !v)}
              aria-expanded={showPastProposals}
              className="text-xs font-medium text-neutral-500 underline hover:text-neutral-800"
            >
              {showPastProposals ? "Сокриј историја на промени" : `Историја на промени (${pastProposals.length})`}
            </button>
            {showPastProposals ? proposalList(pastProposals) : null}
          </>
        ) : null}
      </div>
    ) : null;

  async function saveSelectedSeats(seats: SeatInput[]) {
    if (!seating || !selectedSeatTable) return;
    const loaded = seating.seats
      .filter((s) => s.elementId === selectedSeatTable.elementId)
      .map((s) => ({ seatNumber: s.seatNumber, guestId: s.guestId, guestName: s.guestId ? null : s.guestName }));
    setSeatNotice(null);
    try {
      setSeating(await actions.saveTableSeats!(room.id, selectedSeatTable.elementId, seats, loaded));
      await refreshHistory();
    } catch (err) {
      if (actions.getRoomSeating) setSeating(await actions.getRoomSeating(eventId, room.id));
      setSeatVersion((v) => v + 1);
      setSeatNotice(errorMessage(err, "Не успеа зачувувањето на листата."));
    }
  }

  /** The couple panel's look of this same editor (see the `look` prop). */
  function renderCouple() {
    const canEdit = !viewOnly;
    const canSeat = !!seating && !!actions.moveSeat && !seatingReadOnly && !viewOnly;
    const zoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
    const zoomIn = () => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)));

    // One menu for everything that can be added: the room's table types
    // first, then the special tables, then the other elements.
    const addItems: ToolbarMenuItem[] = [
      ...tableTypes.map((tt) => ({
        key: tt.id,
        label: `${tt.name} (${tablesPlacedForType(tt.id)}/${tt.quantity})`,
        onSelect: () => handleAddTable(tt),
        disabled: tablesPlacedForType(tt.id) >= tt.quantity,
      })),
      { key: "couple", label: "Маса на младенците", onSelect: () => handleAddSpecialTable("couple"), disabled: !specialTableType, separated: tableTypes.length > 0 },
      { key: "head", label: "Главна маса", onSelect: () => handleAddSpecialTable("head"), disabled: !specialTableType },
      { key: "crew", label: "Маса за музика/фотографи", onSelect: () => handleAddSpecialTable("crew"), disabled: !specialTableType },
      { key: "stage", label: "Бина", onSelect: () => handleAddMovable("stage"), separated: true },
      { key: "dance_floor", label: "Танц подиум", onSelect: () => handleAddMovable("dance_floor") },
      { key: "bar_movable", label: "Шанк", onSelect: () => handleAddMovable("bar_movable") },
      { key: "music", label: "Музика", onSelect: () => handleAddMovable("music") },
      { key: "photo_stage", label: "Бина за сликање", onSelect: () => handleAddMovable("photo_stage") },
    ];

    const selectedLabel = selectedTable ? (canvasElements.find((c) => c.id === selectedTable.id)?.label ?? "Маса") : "";
    const selectedType = selectedTable ? tableTypes.find((tt) => tt.id === selectedTable.table_type_id) : undefined;
    const selectedRole = selectedTable?.table_role ?? "guest";

    return (
      <div className="cs-page">
        <header className="cs-head">
          <SprigIcon className="cs-head-sprig" />
          <div className="cs-head-text">
            <p className="cs-eyebrow">{eventName}</p>
            <h2 className="cs-title">{room.name} — Распоред на седење</h2>
            <span className="cs-seat-pill">
              <Icon name="users" size="sm" />
              {seatedCount} седишта
            </span>
          </div>
          {canEdit && (actions.confirm || actions.sendProposal) ? (
            <button type="button" onClick={handleSendProposal} disabled={isSendingProposal} className="cs-btn cs-btn-send">
              <Icon name="mail" size="sm" />
              {isSendingProposal ? "Се испраќа..." : actions.confirm ? "Испрати распоред на локалот" : "Испрати распоред на парот"}
            </button>
          ) : null}
        </header>

        {guestCountEstimate !== null && guestCountEstimate > seatedCount ? (
          <p className="cs-note">
            Бројот на гости ({guestCountEstimate}) го надминува капацитетот на тековниот распоред ({seatedCount}).
          </p>
        ) : null}
        {viewOnly && viewOnlyNotice ? (
          <p role="status" className="cs-note">
            {viewOnlyNotice}
          </p>
        ) : null}
        {proposalItems ? <div className="cs-proposals">{proposalItems}</div> : null}

        <div className="cs-toolbar">
          {canEdit ? (
            <>
              <ToolbarMenu primary label="Додај елемент" icon="plus" items={addItems} />
              <span className="cs-toolbar-div" aria-hidden />
            </>
          ) : null}
          {printLinks ? (
            <>
              <Link href={printLinks.plan} className="cs-btn" target="_blank">
                <PrinterIcon className="i i-sm" />
                Печати план
              </Link>
              {printLinks.qr ? (
                <Link href={printLinks.qr} className="cs-btn" target="_blank">
                  <QrIcon className="i i-sm" />
                  QR по маса
                </Link>
              ) : null}
            </>
          ) : null}
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={handleUndo}
                disabled={actions.getHistoryState ? !history.canUndo || isUndoing : !canUndo || isUndoing}
                className="cs-btn"
                title="Ctrl+Z"
              >
                <Icon name="left" size="sm" />
                Врати
              </button>
              {actions.redo ? (
                <button type="button" onClick={handleRedo} disabled={!history.canRedo || isRedoing} className="cs-btn" title="Shift+Ctrl+Z">
                  <Icon name="right" size="sm" />
                  Повтор
                </button>
              ) : null}
              {actions.resetToBaseline ? (
                <button type="button" onClick={handleResetToBaseline} disabled={isResettingBaseline} className="cs-btn">
                  <Icon name="refresh" size="sm" />
                  {isResettingBaseline ? "Се враќа..." : "Првичен распоред"}
                </button>
              ) : null}
            </>
          ) : null}
          {seating ? (
            <div className="cs-views" role="group" aria-label="Приказ">
              <button type="button" aria-pressed={!showAllTables} onClick={() => setShowAllTables(false)}>
                <Icon name="tables" size="sm" />
                План
              </button>
              <button type="button" aria-pressed={showAllTables} onClick={() => setShowAllTables(true)}>
                <Icon name="menu" size="sm" />
                Листа на маси
              </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="cs-error">
            {error}
          </p>
        ) : null}
        {groupMode ? (
          <div className="cs-groupbar">
            <span>Изберете ги масите што сакате да ги групирате ({groupPick.length}).</span>
            <button type="button" onClick={handleGroup} disabled={groupPick.length < 2} className="cs-btn cs-btn-primary">
              Групирај ({groupPick.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setGroupMode(false);
                setGroupPick([]);
              }}
              className="cs-btn"
            >
              Откажи
            </button>
          </div>
        ) : null}

        {/* "Листа на маси" takes the plan's place; a picked card is the
            selected table once the couple switches back to План. */}
        {showAllTables && seating ? (
          <div className="cs-card cs-list">
            <AllTablesView
              roomName={room.name}
              seating={seating}
              highlightedId={highlightedId}
              onHighlight={(id) => {
                setHighlightedId(id);
                if (!id) return;
                setSelectedId(id);
                setSeatNotice(null);
              }}
            />
          </div>
        ) : (
          <div className="cs-body">
            <section className="cs-card cs-plan" aria-label="План на салата">
              <div className="cs-plan-head">
                {seating ? (
                  <ul aria-label="Легенда" className="cs-legend">
                    {(Object.keys(OCCUPANCY_COLORS) as Occupancy[]).map((o) => (
                      <li key={o}>
                        <span className="cs-legend-dot" style={{ background: OCCUPANCY_COLORS[o] }} />
                        {OCCUPANCY_LABELS[o]}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span />
                )}
                <div className="cs-zoom" role="group" aria-label="Зум">
                  <button type="button" aria-label="Одзумирај" onClick={zoomOut}>
                    <Icon name="minus" size="sm" />
                  </button>
                  <button type="button" onClick={() => setZoom(1)} className="cs-zoom-val" title="Врати на 100%">
                    {Math.round(zoom * 100)}%
                  </button>
                  <button type="button" aria-label="Зумирај" onClick={zoomIn}>
                    <Icon name="plus" size="sm" />
                  </button>
                </div>
              </div>
              <div ref={canvasWrapRef} className="cs-canvas">
                <FloorPlanCanvas
                  widthCm={room.width_cm}
                  heightCm={room.height_cm}
                  elements={canvasElements}
                  selectedElementId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setSeatNotice(null);
                  }}
                  onMoveEnd={handleMoveEnd}
                  onResizeEnd={handleResizeEnd}
                  onRotateEnd={handleRotateEnd}
                  onDelete={handleDelete}
                  mode={groupMode ? "select" : "edit"}
                  selectedIds={groupPick}
                  onToggleSelect={toggleGroupPick}
                  groups={groupOutlines}
                  zoom={zoom}
                  watermarkUrl={logoUrl}
                  selectionTone="gold"
                />
              </div>
            </section>

            <aside className="cs-card cs-side" aria-label="Гости и маси">
              <div role="tablist" aria-label="Страничен панел" className="cs-tabs">
                <button type="button" role="tab" aria-selected={sideTab === "guests"} onClick={() => setSideTab("guests")}>
                  <Icon name="users" size="sm" />
                  Гости
                </button>
                <button type="button" role="tab" aria-selected={sideTab === "table"} onClick={() => setSideTab("table")}>
                  <Icon name="help" size="sm" />
                  Детали за маса
                </button>
              </div>
              <div role="tabpanel" className="cs-tabpanel">
                {sideTab === "guests" ? (
                  <>
                    {seatNotice ? <p className="cs-note">{seatNotice}</p> : null}
                    {canSeat && seating ? (
                      <GuestRail variant="couple" guests={seating.guests} draggingGuestId={draggingGuestId} onDragStart={setDraggingGuestId} />
                    ) : null}
                    {selectedSeatTable && seating ? (
                      <TableSeatsPanel
                        key={`${selectedSeatTable.elementId}:${selectedSeatTable.capacity}:${seatVersion}`}
                        variant="couple"
                        table={selectedSeatTable}
                        seats={seating.seats.filter((s) => s.elementId === selectedSeatTable.elementId)}
                        guests={seating.guests}
                        readOnly={seatingReadOnly || viewOnly || !actions.saveTableSeats}
                        draggingGuestId={draggingGuestId}
                        onDropGuest={actions.moveSeat ? handleDropGuest : undefined}
                        onSave={saveSelectedSeats}
                      />
                    ) : (
                      <p className="cs-empty">Изберете маса на планот за да ги видите и пополните седиштата.</p>
                    )}
                  </>
                ) : selectedTable ? (
                  <div className="cs-details">
                    <h3 className="cs-seats-title">{selectedLabel}</h3>
                    <dl className="cs-facts">
                      {selectedRole !== "guest" ? (
                        <div>
                          <dt>Вид</dt>
                          <dd>{TABLE_ROLE_LABELS[selectedRole]}</dd>
                        </div>
                      ) : null}
                      {selectedType ? (
                        <div>
                          <dt>Тип на маса</dt>
                          <dd>{selectedType.name}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>Седишта</dt>
                        <dd>{seatsOf(selectedTable)}</dd>
                      </div>
                      {selectedSeatTable ? (
                        <div>
                          <dt>Пополнетост</dt>
                          <dd>
                            {seatedAt(selectedTable.id)}/{selectedSeatTable.capacity} ·{" "}
                            {OCCUPANCY_LABELS[occupancyOf(selectedSeatTable.capacity, seatedAt(selectedTable.id))]}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    {actions.relabelElement && canEdit ? (
                      <form
                        key={`label:${selectedTable.id}:${selectedTable.label ?? ""}`}
                        className="cs-label-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const field = e.currentTarget.elements.namedItem("table-label") as HTMLInputElement;
                          handleRelabel(selectedTable.id, field.value);
                        }}
                      >
                        <label htmlFor={`table-label-${selectedTable.id}`}>Ознака на масата</label>
                        <div className="cs-label-row">
                          <input
                            id={`table-label-${selectedTable.id}`}
                            name="table-label"
                            defaultValue={selectedTable.label ?? ""}
                            placeholder="на пр. 12 или Кумови"
                            maxLength={200}
                          />
                          <button type="submit" className="cs-btn">
                            Зачувај ознака
                          </button>
                        </div>
                      </form>
                    ) : null}
                    {canEdit ? (
                      <div className="cs-details-actions">
                        {actions.ungroup && selectedGroupId ? (
                          <button type="button" onClick={() => handleUngroup(selectedGroupId)} className="cs-btn">
                            <Icon name="ungroup" size="sm" />
                            Разгрупирај
                          </button>
                        ) : null}
                        <button type="button" onClick={() => handleDelete(selectedTable.id)} className="cs-btn cs-btn-danger">
                          <Icon name="trash" size="sm" />
                          Отстрани ја масата
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="cs-empty">Изберете маса на планот за да ги видите деталите.</p>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    );
  }

  if (look === "couple") return renderCouple();

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-block text-sm font-medium text-lilac-dark"
        >
          {backLabel}
        </button>
      ) : (
        <Link href={backHref} className="mb-4 inline-block text-sm font-medium text-lilac-dark">
          {backLabel}
        </Link>
      )}
      <h1 className="mb-1 font-display text-3xl text-neutral-900">{room.name} — Распоред на маси</h1>
      <p className="mb-1 text-sm text-neutral-500">{eventName}</p>
      <p className="mb-2 text-sm font-medium text-neutral-900">
        <span className="inline-flex items-center rounded-full bg-lilac-light px-3 py-1">{seatedCount} седишта</span>
      </p>
      {guestCountEstimate !== null && guestCountEstimate > seatedCount ? (
        <p className="mb-6 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Бројот на гости ({guestCountEstimate}) го надминува капацитетот на тековниот распоред ({seatedCount}).
        </p>
      ) : null}

      {viewOnly && viewOnlyNotice ? (
        <p role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {viewOnlyNotice}
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        {viewOnly ? null : (
        <>
        <button type="button" onClick={() => handleAddMovable("stage")} className={PALETTE_BUTTON_CLASS}>
          + Бина
        </button>
        <button type="button" onClick={() => handleAddMovable("dance_floor")} className={PALETTE_BUTTON_CLASS}>
          + Танц подиум
        </button>
        <button type="button" onClick={() => handleAddMovable("bar_movable")} className={PALETTE_BUTTON_CLASS}>
          + Шанк
        </button>
        <button type="button" onClick={() => handleAddMovable("music")} className={PALETTE_BUTTON_CLASS}>
          + Музика
        </button>
        <button type="button" onClick={() => handleAddMovable("photo_stage")} className={PALETTE_BUTTON_CLASS}>
          + Бина за сликање
        </button>
        <button type="button" onClick={() => handleAddSpecialTable("couple")} disabled={!specialTableType} className={PALETTE_BUTTON_CLASS}>
          + Маса на младенците
        </button>
        <button type="button" onClick={() => handleAddSpecialTable("head")} disabled={!specialTableType} className={PALETTE_BUTTON_CLASS}>
          + Главна маса
        </button>
        <button type="button" onClick={() => handleAddSpecialTable("crew")} disabled={!specialTableType} className={PALETTE_BUTTON_CLASS}>
          + Маса за музика/фотографи
        </button>
        {tableTypes.map((tt) => (
          <button
            key={tt.id}
            type="button"
            onClick={() => handleAddTable(tt)}
            disabled={tablesPlacedForType(tt.id) >= tt.quantity}
            className={PALETTE_BUTTON_CLASS}
          >
            + {tt.name} ({tablesPlacedForType(tt.id)}/{tt.quantity})
          </button>
        ))}
        <button type="button" onClick={handleRevert} className={PALETTE_BUTTON_CLASS}>
          Врати на стандарден распоред
        </button>
        {actions.loadPreset && presets.length > 0 ? (
          <>
            <select
              className={PALETTE_BUTTON_CLASS}
              value={selectedPresetId}
              onChange={(e) => setSelectedPresetId(e.target.value)}
              aria-label="Избери зачуван план"
            >
              <option value="">Избери зачуван план…</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleLoadPreset} disabled={!selectedPresetId || isLoadingPreset} className={PALETTE_BUTTON_CLASS}>
              {isLoadingPreset ? "Се применува..." : "Примени план"}
            </button>
          </>
        ) : null}
        {actions.resetToBaseline ? (
          <button type="button" onClick={handleResetToBaseline} disabled={isResettingBaseline} className={PALETTE_BUTTON_CLASS}>
            {isResettingBaseline ? "Се враќа..." : "Врати на договорениот распоред"}
          </button>
        ) : null}
        {actions.group ? (
          groupMode ? (
            <>
              <button type="button" onClick={handleGroup} disabled={groupPick.length < 2} className={PALETTE_BUTTON_CLASS}>
                Групирај ({groupPick.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroupMode(false);
                  setGroupPick([]);
                }}
                className={PALETTE_BUTTON_CLASS}
              >
                Откажи
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setGroupMode(true);
                setSelectedId(null);
              }}
              className={PALETTE_BUTTON_CLASS}
            >
              + Групирај маси
            </button>
          )
        ) : null}
        {actions.ungroup && selectedGroupId && !groupMode ? (
          <button type="button" onClick={() => handleUngroup(selectedGroupId)} className={PALETTE_BUTTON_CLASS}>
            Разгрупирај
          </button>
        ) : null}
        </>
        )}
        {seating ? (
          <button
            type="button"
            aria-pressed={showAllTables}
            onClick={() => {
              setShowAllTables((v) => !v);
              setHighlightedId(null);
            }}
            className={PALETTE_BUTTON_CLASS}
          >
            Сите маси
          </button>
        ) : null}
      </div>

      {printLinks ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <Link href={printLinks.plan} className={PALETTE_BUTTON_CLASS} target="_blank">
            Печати план
          </Link>
          {printLinks.qr ? (
            <Link href={printLinks.qr} className={PALETTE_BUTTON_CLASS} target="_blank">
              QR по маса
            </Link>
          ) : null}
        </div>
      ) : null}

      {!viewOnly && (actions.confirm || actions.sendProposal) ? (
        <div className="mb-3 space-y-2">
          <button
            type="button"
            onClick={handleSendProposal}
            disabled={isSendingProposal}
            className="rounded-full bg-lilac-dark px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSendingProposal ? "Се испраќа..." : actions.confirm ? "Испрати распоред на локалот" : "Испрати распоред на парот"}
          </button>
          {proposalItems}
        </div>
      ) : null}

      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      <div className="mb-2 flex flex-wrap items-center gap-1">
        <div className="flex items-center gap-1" role="group" aria-label="Зум">
          <button type="button" aria-label="Одзумирај" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className={PALETTE_BUTTON_CLASS}>
            −
          </button>
          <button type="button" onClick={() => setZoom(1)} className={PALETTE_BUTTON_CLASS}>
            100%
          </button>
          <button type="button" aria-label="Зумирај" onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))} className={PALETTE_BUTTON_CLASS}>
            +
          </button>
          <span className="ml-1 text-xs text-neutral-500">{Math.round(zoom * 100)}%</span>
        </div>
        {viewOnly ? null : actions.getHistoryState ? (
          <>
            <button type="button" onClick={handleUndo} disabled={!history.canUndo || isUndoing} className={`${PALETTE_BUTTON_CLASS} ml-2`} title="Ctrl+Z">
              ← Врати
            </button>
            <button type="button" onClick={handleRedo} disabled={!history.canRedo || isRedoing} className={PALETTE_BUTTON_CLASS} title="Shift+Ctrl+Z">
              Повтори →
            </button>
          </>
        ) : (
          <button type="button" onClick={handleUndo} disabled={!canUndo || isUndoing} className={`${PALETTE_BUTTON_CLASS} ml-2`}>
            {isUndoing ? "Се враќа..." : "← Врати"}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div ref={canvasWrapRef} className="min-w-0 flex-1 overflow-x-auto">
        <FloorPlanCanvas
          widthCm={room.width_cm}
          heightCm={room.height_cm}
          elements={canvasElements}
          selectedElementId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setSeatNotice(null);
          }}
          onMoveEnd={handleMoveEnd}
          onResizeEnd={handleResizeEnd}
          onRotateEnd={handleRotateEnd}
          onDelete={handleDelete}
          mode={groupMode ? "select" : "edit"}
          selectedIds={groupPick}
          onToggleSelect={toggleGroupPick}
          groups={groupOutlines}
          zoom={zoom}
          watermarkUrl={logoUrl}
        />
      </div>
      {selectedTable ? (
        <div className="max-h-[50vh] space-y-3 overflow-auto lg:max-h-none lg:w-80 lg:shrink-0">
          {actions.relabelElement && !viewOnly ? (
            <form
              key={`label:${selectedTable.id}:${selectedTable.label ?? ""}`}
              className="flex items-end gap-2 rounded-2xl border border-neutral-200 bg-white p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const field = e.currentTarget.elements.namedItem("table-label") as HTMLInputElement;
                handleRelabel(selectedTable.id, field.value);
              }}
            >
              <label className="flex-1 text-sm text-neutral-600">
                Ознака на масата
                <input
                  name="table-label"
                  defaultValue={selectedTable.label ?? ""}
                  placeholder="на пр. 12 или Кумови"
                  maxLength={200}
                  className="mt-1 block w-full rounded-lg border border-neutral-200 px-2 py-1 text-sm text-neutral-900"
                />
              </label>
              <button type="submit" className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-medium text-neutral-700 hover:border-lilac-dark">
                Зачувај ознака
              </button>
            </form>
          ) : null}
          {selectedSeatTable && seating ? (
          <>
          {seatNotice ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{seatNotice}</p> : null}
          {actions.moveSeat && !seatingReadOnly && !viewOnly ? (
            <GuestRail guests={seating.guests} draggingGuestId={draggingGuestId} onDragStart={setDraggingGuestId} />
          ) : null}
          <TableSeatsPanel
            key={`${selectedSeatTable.elementId}:${selectedSeatTable.capacity}:${seatVersion}`}
            table={selectedSeatTable}
            seats={seating.seats.filter((s) => s.elementId === selectedSeatTable.elementId)}
            guests={seating.guests}
            readOnly={seatingReadOnly || viewOnly || !actions.saveTableSeats}
            draggingGuestId={draggingGuestId}
            onDropGuest={actions.moveSeat ? handleDropGuest : undefined}
            onClose={() => setSelectedId(null)}
            onSave={saveSelectedSeats}
          />
          </>
          ) : null}
        </div>
      ) : null}
      </div>
      {seating ? (
        <ul aria-label="Легенда" className="mt-3 flex flex-wrap gap-2 text-sm text-neutral-600">
          {(Object.keys(OCCUPANCY_COLORS) as Occupancy[]).map((o) => (
            <li
              key={o}
              className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs shadow-sm"
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: OCCUPANCY_COLORS[o] }} />
              {OCCUPANCY_LABELS[o]}
            </li>
          ))}
        </ul>
      ) : null}
      {showAllTables && seating ? (
        <AllTablesView roomName={room.name} seating={seating} highlightedId={highlightedId} onHighlight={setHighlightedId} />
      ) : null}
    </div>
  );
}
