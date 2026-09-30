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
