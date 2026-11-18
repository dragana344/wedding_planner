"use client";

import { useState } from "react";
import { NO_PLACE, placeMode, venuePlace, type AgendaPlace, type PlaceMode, type VenueInfo } from "@/lib/couple/agenda-place";

/**
 * "Каде?" for an agenda item: nothing, the restaurant (name, hall, address
 * and map link filled in automatically) or another place typed by hand.
 */
export function AgendaPlaceFields({
  idPrefix,
  venue,
  value,
  onChange,
}: {
  idPrefix: string;
  venue: VenueInfo;
  value: AgendaPlace;
  onChange: (place: AgendaPlace) => void;
}) {
  const [mode, setMode] = useState<PlaceMode>(() => placeMode(value, venue));

  function choose(next: PlaceMode) {
    setMode(next);
    if (next === "none") onChange(NO_PLACE);
    else if (next === "venue") onChange(venuePlace(venue));
    else if (placeMode(value, venue) === "venue") onChange(NO_PLACE); // don't carry the restaurant's text into "another place"
  }

  return (
    <>
      <div>
        <label className="lab-s" htmlFor={`${idPrefix}-where`}>
          Каде (опционално)
        </label>
        <select id={`${idPrefix}-where`} className="fld" value={mode} onChange={(e) => choose(e.target.value as PlaceMode)}>
          <option value="none">Без место</option>
          <option value="venue">Во ресторанот — {venue.name}</option>
          <option value="custom">Друго место</option>
        </select>
      </div>
      {mode === "venue" ? (
        <p className="agenda-place-auto">
          {value.location}
          {value.address ? ` · ${value.address}` : ""}
        </p>
      ) : null}
      {mode === "custom" ? (
        <>
          <div>
            <label className="lab-s" htmlFor={`${idPrefix}-place`}>
              Назив на местото
            </label>
            <input
              id={`${idPrefix}-place`}
              className="fld"
              placeholder="пр. Црква Св. Климент Охридски"
              value={value.location}
              onChange={(e) => onChange({ ...value, location: e.target.value })}
              maxLength={200}
            />
          </div>
          <div>
            <label className="lab-s" htmlFor={`${idPrefix}-address`}>
              Адреса
            </label>
            <input id={`${idPrefix}-address`} className="fld" placeholder="Улица, град..." value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} maxLength={500} />
          </div>
          <div>
            <label className="lab-s" htmlFor={`${idPrefix}-map`}>
              Линк до мапа
            </label>
            <input id={`${idPrefix}-map`} className="fld" placeholder="https://..." value={value.mapUrl} onChange={(e) => onChange({ ...value, mapUrl: e.target.value })} maxLength={2000} />
          </div>
        </>
      ) : null}
    </>
  );
}
