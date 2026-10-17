-- Security review item #4 (admin-mediated owner/manager password reset has
-- no owner-facing signal): records when support last reset this manager's
-- password through the admin panel, so the venue can be shown a one-time
-- "your password was reset by support on [date]" notice. Null means either
-- it never happened, or it happened and was already dismissed — the two
-- states are indistinguishable by design, since once acknowledged there's
-- nothing left to show.
--
-- Deliberately separate from `change_venue_manager_password`'s own effects
-- (it also serves a self-service change path, if one is ever added — this
-- column must only be set by the admin-initiated path in
-- lib/admin/venue-actions-core.ts, never by the RPC itself).

alter table venue_managers
  add column password_reset_notice_at timestamptz;
