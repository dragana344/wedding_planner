-- 0098: one-time backfill for every venue that predates the manager/staff
-- feature (spec D6/§8) — name "owner", password "owner12345".
--
-- TEST-PHASE-ONLY. This fixed, publicly-documented password is acceptable
-- only because no real venue is live yet (spec D6). This migration must
-- NEVER be re-run (or copied into a new migration) against a dataset that
-- holds real venues — every such venue would get a publicly-known manager
-- password. Scoped by "has zero venue_managers rows", so running it twice
-- against the same database is a safe no-op either way, but that safety
-- does not make it safe to run against production data.

begin;

insert into venue_managers (venue_id, name, password_hash, is_owner)
select v.id, 'owner', extensions.crypt('owner12345', extensions.gen_salt('bf', 10)), true
from venues v
where not exists (select 1 from venue_managers m where m.venue_id = v.id);

commit;
