# SEC-006 - Harden SECURITY DEFINER functions and function grants

**Category:** security · **Priority:** P1 · **Effort:** S · **Depends on:** TEST-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

is_venue_staff_for, is_organizer_for_event, create_event_credentials, regenerate_event_password, get_event_username, verify_event_credentials and the layout-password functions are SECURITY DEFINER without `set search_path`, which Supabase's advisor flags (function_search_path_mutable) - a caller-controlled search_path can hijack unqualified names. Add `set search_path = public, extensions` (or pg_catalog + schema-qualify), and `revoke execute ... from public, anon` so each function is callable only by the roles the comments intend.

## Coachfio reference

Coachfio treats privileged code paths as the highest-risk surface and pins them with tests.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `migrations/versions/*`
- `admin/vault_crypto.py`

## Steps

Target files:

- `supabase/migrations/00xx_harden_security_definer.sql (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] All SECURITY DEFINER functions set an explicit search_path.
- [ ] anon cannot execute any credential function; verify_event_credentials is service_role only.
- [ ] Supabase database advisor shows no security findings for these functions.

## Verification

- `supabase db lint`
- `select proname, proconfig from pg_proc where prosecdef;`
- DB tests still pass

## Out of scope

- Changing what the functions compute.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
