-- 0102: regenerate_event_password was grantable to any authenticated venue
-- staff session (0031), so a plain (non-elevated) staff member could reset
-- a couple's login password directly via RPC, bypassing the manager
-- elevation gating added for events/Settings/Reports in the venue-manager
-- -staff-login plans (final review Important finding, declined at the time
-- as its own follow-up). The function already special-cases service_role
-- (skips its own is_venue_staff_for check), so the new gated API route can
-- call it unchanged with a service-role client; only the direct
-- authenticated grant needs to go. The platform admin tool
-- (lib/admin/event-actions-core.ts) already passes a service-role client,
-- so it is unaffected.

begin;

revoke execute on function public.regenerate_event_password(uuid, text) from authenticated;

commit;
