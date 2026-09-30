# SEC-026 - security.txt and a disclosure contact

**Category:** security · **Priority:** P2 · **Effort:** S · **Depends on:** INFRA-002

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Publish /.well-known/security.txt (RFC 9116) with a contact address and expiry.

## Coachfio reference

A reachable security contact turns a finder into a reporter.

## Steps

Target files:

- `public/.well-known/security.txt (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] https://<domain>/.well-known/security.txt is served.

## Verification

- `curl https://<domain>/.well-known/security.txt`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
