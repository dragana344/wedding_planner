-- Optional "who was paid / when / notes" detail on a budget line item, to
-- match the couple's own budget page redesign (category rollup + a fuller
-- add-item form). All nullable: every existing row and every existing
-- insert/update call site that doesn't know about these yet keeps working.
alter table event_budget_items
  add column paid_by text,
  add column payment_date date,
  add column notes text;
