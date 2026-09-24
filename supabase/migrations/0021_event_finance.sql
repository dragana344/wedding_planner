-- Manual, staff-entered record-keeping only — no invoicing or payment
-- processing exists in this app. Mirrors the "manual invoice/bank transfer"
-- assumption already noted in the B2B venue panel design spec.
alter table events add column total_price numeric null;
alter table events add column deposit_paid numeric null;
