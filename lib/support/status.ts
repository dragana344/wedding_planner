// Shared by the requester's Поддршка page and both admin systems (inbox and
// admin tasks): all three use the same new → in_progress → done statuses
// (migration 0150). Plain module, safe for client components.

export type SupportStatus = "new" | "in_progress" | "done";

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = { new: "Ново", in_progress: "Во тек", done: "Решено" };
export const SUPPORT_STATUS_PILL: Record<SupportStatus, string> = { new: "p-warn", in_progress: "p-info", done: "p-ok" };
export const SUPPORT_STATUSES: SupportStatus[] = ["new", "in_progress", "done"];

export const isSupportStatus = (value: string | undefined): value is SupportStatus =>
  value === "new" || value === "in_progress" || value === "done";
