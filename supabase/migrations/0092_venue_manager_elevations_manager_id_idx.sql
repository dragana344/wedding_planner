-- 0092: DATA-004 — every foreign key column needs an index.
-- venue_manager_elevations.manager_id (fk to venue_managers) was missed in
-- 0090; only venue_id got one.

begin;

create index venue_manager_elevations_manager_id_idx on venue_manager_elevations(manager_id);

commit;
