/**
 * List-row display for a note, matching how Apple Notes derives a title:
 * an explicit title wins; otherwise the first non-blank line of the content
 * becomes the title and the next non-blank line becomes the preview. An
 * explicit title always pairs with the content's first non-blank line as
 * its preview, since in that case the title hasn't "consumed" any of it.
 */
export function deriveNoteDisplay(title: string | null, content: string): { title: string; preview: string } {
  const lines = content.split("\n").map((l) => l.trim());
  const nonBlank = lines.filter((l) => l.length > 0);
  const explicitTitle = title?.trim();

  if (explicitTitle) {
    return { title: explicitTitle, preview: nonBlank[0] ?? "" };
  }
  return { title: nonBlank[0] ?? "Белешка без наслов", preview: nonBlank[1] ?? "" };
}

const MK_MONTHS = [
  "јануари", "февруари", "март", "април", "мај", "јуни",
  "јули", "август", "септември", "октомври", "ноември", "декември",
];

function daysBetween(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da.getTime() - db.getTime()) / 86_400_000);
}

/** "денес" / "вчера" / "на 18 март", relative to now. */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diff = daysBetween(now, d);
  if (diff === 0) return "денес";
  if (diff === 1) return "вчера";
  return `на ${d.getDate()} ${MK_MONTHS[d.getMonth()]}`;
}

/** "денес во 14:27" — the save-status line under the editor. */
export function formatSavedAt(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${formatRelativeDay(iso, now)} во ${time}`;
}
