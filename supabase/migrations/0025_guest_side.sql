-- Bride's-side / groom's-side split for the guest list, shown only for
-- wedding events (events.event_type = 'wedding'). Nullable since it's
-- meaningless for other event types and for any guest added before this.
alter table event_guests add column side text check (side is null or side in ('bride', 'groom'));
