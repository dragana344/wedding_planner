// Dates and times shown in the album and greetings, always in the venue's
// time zone and in the Macedonian "12.06.2027" / "21:05" shape (the mk-MK
// locale varies between runtimes, e.g. "12.6.2027 г.").
import { VENUE_TIME_ZONE } from "@/lib/date";

const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: VENUE_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: VENUE_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });

export function formatDay(iso: string): string {
  return DATE.format(new Date(iso)).replace(/\//g, ".");
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}
