-- 0052: is_public marks which plans are safe to show to couples (review
-- ruling on tasks 2.8/2.9): /couple/packages must not leak custom/negotiated
-- admin plans or test fixtures to couples just because a plan row exists.
-- Only the pricing-slide packages (0051) are public; the default plan and
-- everything else (including any future admin-created custom plan) default
-- to hidden.

begin;

alter table public.plans add column is_public boolean not null default false;

update public.plans set is_public = true where name in ('START', 'PREMIUM', 'PREMIUM+', 'ULTRA');

commit;
