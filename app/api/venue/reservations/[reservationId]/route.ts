import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { assertEventNotPast, EventNotFoundError, PastEventError } from "@/lib/venue/events";
import {
  deleteInactiveReservation,
  findConflictingTables,
  getVenueReservation,
  isActiveReservation,
  setReservationStatus,
  ReservationNotFoundError,
  type ReservationStatus,
} from "@/lib/venue/reservations";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { todayIn } from "@/lib/date";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, reservationStatusBody, uuid } from "@/lib/api/schemas";

// Group A task 4 (0174): "Откажи" / "Гостите заминаа" change the status and
// keep the row; "Избриши засекогаш" is a separate action for a booking that
// is already cancelled or completed. Every waiter can do these (as before),
// so a manager login is optional — when present it is named on the audit
// row. Cancelling a mini event cancels the event itself, which (like
// deleting it used to) needs a manager. Writes go through 0174's functions
// with the service-role client; venueId is what scopes them.

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";
const paramsSchema = z.object({ reservationId: uuid });

/** Which status changes the day list offers; anything else is refused. */
const ALLOWED: Record<ReservationStatus, ReservationStatus[]> = {
  reserved: ["seated", "cancelled"],
  seated: ["completed", "cancelled"],
  cancelled: ["reserved"],
  completed: [],
};

async function caller(request: Request) {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  if (!venueId) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const manager = await requireManagerElevation(request, venueId);
  return { venueId, actorId: user?.id ?? null, managerName: manager?.managerName ?? null };
}

export const PATCH = withPublic(
  async ({ request, params, body }) => {
    const who = await caller(request);
    if (!who) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const db = createServiceRoleClient();
    try {
      const reservation = await getVenueReservation(params.reservationId, who.venueId, db);
      if (!reservation) throw new ReservationNotFoundError();
      const next = body.status;
      if (reservation.status === next) return NextResponse.json({ ok: true });
      if (!ALLOWED[reservation.status].includes(next)) {
        return NextResponse.json({ error: "Оваа промена не е можна за резервацијата." }, { status: 400 });
      }

      if (reservation.event_id) {
        if (next === "reserved") {
          return NextResponse.json({ error: "Мини настанот се враќа од страницата на настанот." }, { status: 400 });
        }
        if (next === "cancelled") {
          if (!who.managerName) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
          await assertEventNotPast(reservation.event_id, who.venueId, db);
        }
      }

      if (next === "reserved") {
        // Restoring: only a booking still ahead, and only when its tables
        // are still free (0035 refuses an overlap anyway; this gives the
        // same friendly message the booking form does).
        if (reservation.date < todayIn()) {
          return NextResponse.json({ error: "Помината резервација не може да се врати." }, { status: 400 });
        }
        const conflicts = await findConflictingTables(
          reservation.room_id, reservation.date, reservation.start_time, reservation.end_time, reservation.table_ids, reservation.id, db,
        );
        if (conflicts.length > 0) {
          return NextResponse.json({ error: "Една или повеќе од масите се веќе резервирани за тоа време." }, { status: 409 });
        }
      }

      await setReservationStatus(reservation.id, who.venueId, next, who, db);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof ReservationNotFoundError || err instanceof EventNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      if (err instanceof PastEventError) return NextResponse.json({ error: err.message }, { status: 409 });
      return errorResponse(err, "Не успеа промената на резервацијата. Обидете се повторно.", request);
    }
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: reservationStatusBody, params: paramsSchema, invalidBodyError: "Неважечки статус." },
);

export const DELETE = withPublic(
  async ({ request, params }) => {
    const who = await caller(request);
    if (!who) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const db = createServiceRoleClient();
    try {
      const reservation = await getVenueReservation(params.reservationId, who.venueId, db);
      if (!reservation) throw new ReservationNotFoundError();
      if (reservation.event_id) {
        return NextResponse.json({ error: "Мини настанот се брише од страницата на настанот." }, { status: 400 });
      }
      if (isActiveReservation(reservation)) {
        return NextResponse.json({ error: "Прво откажете ја резервацијата." }, { status: 400 });
      }
      await deleteInactiveReservation(reservation.id, who.venueId, who, db);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof ReservationNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
      return errorResponse(err, "Резервацијата не можеше да се избрише.", request);
    }
  },
  { params: paramsSchema },
);
