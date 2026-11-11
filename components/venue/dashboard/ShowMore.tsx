"use client";

import { useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";

export const PAGE_SIZE = 10;

/**
 * Shows a long list PAGE_SIZE rows at a time. `resetKey` is anything that
 * changes what the list holds (a filter, a search, a date): when it changes,
 * the list starts over at the first PAGE_SIZE rows.
 */
export function usePaged<T>(items: T[], resetKey: string) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [seenKey, setSeenKey] = useState(resetKey);
  // Reset while rendering (React's "adjusting state when a prop changes"), so
  // the new filter never flashes with the old, longer limit.
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setLimit(PAGE_SIZE);
  }
  return {
    visible: items.slice(0, limit),
    showMore: <ShowMore shown={Math.min(limit, items.length)} total={items.length} onMore={() => setLimit((n) => n + PAGE_SIZE)} />,
  };
}

/** A quiet "10 од 14 · Прикажи уште 4" line under a list; gone once every row is shown. */
export function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  const remaining = total - shown;
  if (remaining <= 0) return null;
  return (
    <div className="show-more">
      <span>
        {shown} од {total}
      </span>
      <button type="button" onClick={onMore}>
        Прикажи уште {Math.min(PAGE_SIZE, remaining)}
        <Icon name="down" size="sm" />
      </button>
    </div>
  );
}
