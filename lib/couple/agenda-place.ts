// Where an agenda item takes place (0156): a name, an address and a map link.
// Pure, shared by the couple's agenda form and the tests.

export interface AgendaPlace {
  location: string;
  address: string;
  mapUrl: string;
}

export interface VenueInfo {
  name: string;
  address: string | null;
  /** The halls booked for the event. */
  rooms: string[];
  /** 0157: the address / map link of the first booked hall that has one; they win over the venue's own address. */
  roomAddress?: string | null;
  roomMapUrl?: string | null;
}

export const NO_PLACE: AgendaPlace = { location: "", address: "", mapUrl: "" };

/** The restaurant as a place: its name (with the hall), its address, and a Google Maps link to it. */
export function venuePlace(venue: VenueInfo): AgendaPlace {
  const address = venue.roomAddress?.trim() || venue.address?.trim() || "";
  const roomMap = venue.roomMapUrl?.trim();
  const location = venue.rooms.length > 0 ? `${venue.name} – ${venue.rooms.join(", ")}` : venue.name;
  const query = [venue.name, address].filter(Boolean).join(", ");
  const search = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return { location, address, mapUrl: roomMap && /^https?:\/\//i.test(roomMap) ? roomMap : search };
}

export type PlaceMode = "none" | "venue" | "custom";

/** Which choice an existing place corresponds to: nothing, the restaurant, or somewhere else. */
export function placeMode(place: AgendaPlace, venue: VenueInfo): PlaceMode {
  if (!place.location.trim() && !place.address.trim() && !place.mapUrl.trim()) return "none";
  const venueName = venue.name.trim().toLowerCase();
  return venueName && place.location.trim().toLowerCase().startsWith(venueName) ? "venue" : "custom";
}
