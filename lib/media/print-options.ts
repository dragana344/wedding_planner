// Options for the printable album QR cards (C4), read from the page's query
// string. A plain module, not the client component: the server page calls it.

export type PrintOptions = { format: "a6" | "a4"; count: number; numbered: boolean };

const DEFAULT_COUNT = 8;
export const MAX_PRINT_COUNT = 60;

/** Reads ?format=a6|a4&count=1..60&numbered=1, falling back to eight A6 cards. */
export function parsePrintOptions(params: Record<string, string | string[] | undefined>): PrintOptions {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const raw = Number.parseInt(one(params.count) ?? "", 10);
  const count = Number.isNaN(raw) ? DEFAULT_COUNT : Math.min(MAX_PRINT_COUNT, Math.max(1, raw));
  return { format: one(params.format) === "a4" ? "a4" : "a6", count, numbered: one(params.numbered) === "1" };
}
