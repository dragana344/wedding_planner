// What the public invitation shows beyond names and date (A14): agenda,
// locations and menu. Pure, shared by the page and the tests.

export interface ProgramItem {
  time: string | null;
  title: string;
}

export interface ProgramLocation {
  label: string;
  address: string | null;
  map_url: string | null;
}

export interface ProgramDish {
  course: "starter" | "main" | "dessert" | "other";
  name: string;
}

export const COURSE_ORDER: ProgramDish["course"][] = ["starter", "main", "dessert", "other"];
export const COURSE_LABELS: Record<ProgramDish["course"], string> = {
  starter: "Предјадење",
  main: "Главно јадење",
  dessert: "Десерт",
  other: "Друго",
};

/**
 * A map link that is safe on a public page: the couple's own link only when
 * it is http(s) (never javascript:, data:, protocol-relative…), else a Google
 * Maps search for the address, else nothing.
 */
export function mapsHref(location: { address: string | null; map_url: string | null }): string | null {
  const url = location.map_url?.trim();
  if (url && /^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href === url ? url : parsed.href;
    } catch {
      // not a URL: fall through to the address
    }
  }
  const address = location.address?.trim();
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

/** Dishes in serving order, then by name. */
export function sortDishes(dishes: ProgramDish[]): ProgramDish[] {
  return [...dishes].sort((a, b) => COURSE_ORDER.indexOf(a.course) - COURSE_ORDER.indexOf(b.course) || a.name.localeCompare(b.name, "mk"));
}
