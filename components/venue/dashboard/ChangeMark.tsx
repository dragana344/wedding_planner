import type { SeenSection } from "@/lib/changes/types";

/** The "!" shown next to an event the couple has changed since staff last saw it. */
export function ChangeMark({ sections }: { sections: SeenSection[] }) {
  if (sections.length === 0) return null;
  return (
    <span className="change-mark" role="img" title="Има промени од парот" aria-label="Има промени од парот">
      !
    </span>
  );
}
