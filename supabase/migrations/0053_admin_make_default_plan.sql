-- 0053: admin_make_default_plan atomically moves the single-default
-- invariant (plans_single_default, 0048) from the old default plan to a
-- new one.
--
-- Why a function instead of two Server Action updates (clear old default,
-- then set new default): those are two separate statements from the
-- client's perspective. If the second one failed (network blip, the target
-- plan id vanishing between the calls, etc.) after the first had already
-- committed, every plan would read is_default = false and no venue could
-- resolve a default plan_id anywhere it depends on one. Folding both halves
-- into a single UPDATE inside one function call makes the whole move atomic
-- (it either both happens or neither does, and it's a single round trip so
-- there is no "committed the clear but not the set" state to land in).
--
-- This table is shared live by every session/test on this instance (not
-- just this one), so two admins (or two test suites) can call this
-- concurrently against overlapping rows. An advisory lock serialises the
-- whole body across every caller on this instance — same pattern as
-- provision_venue's pg_advisory_xact_lock (0048) — so a concurrent pair of
-- calls can never interleave into a transient state where two rows are
-- true at once (observed in testing: a plain single-statement swap
-- `set is_default = (id = p_plan_id) where is_default or id = p_plan_id`,
-- with no lock, raised "duplicate key value violates unique constraint
-- plans_single_default" under concurrent load from another session). The
-- clear-then-set pair below is two statements, but both run inside this one
-- function call, which Postgres executes as a single top-level statement/
-- transaction: any error (including the not-found check) rolls back both,
-- so a caller never observes a state with zero default plans.
begin;

create or replace function public.admin_make_default_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('admin_make_default_plan'));
  if not exists (select 1 from public.plans where id = p_plan_id) then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  update public.plans set is_default = false where is_default and id <> p_plan_id;
  update public.plans set is_default = true where id = p_plan_id;
end;
$$;

revoke all on function public.admin_make_default_plan(uuid) from public, anon, authenticated;
grant execute on function public.admin_make_default_plan(uuid) to service_role;

commit;
