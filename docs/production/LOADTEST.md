# Load test (TEST-008)

Scripts: `loadtest/invite-rsvp.js` (viral invitation: page views + RSVPs) and `loadtest/venue-panel.js` (busy venue panel). **Staging only**, with the synthetic seed scaled up (e.g. 50 venues, 2 000 events, 500 guests on the test invitation). Never point them at production.

## How to run

1. Staging deployed on the same Vercel plan/region as production and its own Supabase project (REL-002), same compute size as production.
2. Install k6 (`brew install k6`) or use k6 Cloud (needed for many distinct client IPs; see the note on rate limits in the script).
3. `k6 run -e BASE_URL=… -e SLUG=… loadtest/invite-rsvp.js`, then the venue-panel script with a staff cookie.
4. During the run watch Supabase → Reports (CPU, connections, slow queries) and Vercel → Observability (function duration, errors).

## Targets

| Scenario | Load (≈2× expected peak) | p95 target | Error rate |
|---|---|---|---|
| Invitation page | 60 page views/s for 2 min | < 800 ms | < 1 % |
| RSVP | ~30 % of visitors answer | < 1.2 s | < 1 % (429s from the per-IP limit are expected, not errors) |
| Venue panel | 20 concurrent staff browsing | < 1 s | < 1 % |

## Results

| Date | Scenario | p95 | Error rate | Supabase CPU / connections | First bottleneck | Notes |
|---|---|---|---|---|---|---|
| — | invite-rsvp | | | | | |
| — | venue-panel | | | | | |
