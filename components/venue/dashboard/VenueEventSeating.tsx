"use client";

import { useMemo, type ComponentProps } from "react";
import { EventSeatingPage } from "./EventSeatingPage";
import { useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";
import { venueSeatingClientActions } from "@/lib/venue/seating-client";

const STAFF_NOTICE = "Само преглед: најавете се како менаџер за да го уредувате распоредот.";
const PAST_EVENT_NOTICE = "Само преглед: настанот е завршен.";

/**
 * The venue's seating editor for one event room. Everyone at the venue can
 * open it; only an elevated manager can change it (spec §3 — staff: view
 * only). The server re-checks the elevation on every write regardless.
 */
export function VenueEventSeating({
  pastEvent = false,
  ...props
}: Omit<ComponentProps<typeof EventSeatingPage>, "actions" | "viewOnly" | "viewOnlyNotice" | "seatingReadOnly"> & {
  /** A finished event's plan stays as it was — viewable, never editable. */
  pastEvent?: boolean;
}) {
  const { managerName, token } = useManagerElevation();
  const actions = useMemo(() => venueSeatingClientActions(props.eventId, token), [props.eventId, token]);
  const viewOnly = pastEvent || !managerName;
  return (
    <EventSeatingPage
      {...props}
      actions={actions}
      seatingReadOnly
      viewOnly={viewOnly}
      viewOnlyNotice={pastEvent ? PAST_EVENT_NOTICE : STAFF_NOTICE}
    />
  );
}
