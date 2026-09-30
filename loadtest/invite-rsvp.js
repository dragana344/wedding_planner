// TEST-008: an invitation "going viral" — guests opening /invite/<slug> and a
// share of them answering. Run against STAGING only (never production):
//
//   k6 run -e BASE_URL=https://<staging> -e SLUG=<staging invitation slug> loadtest/invite-rsvp.js
//
// Rate limits (SEC-002) key on the client IP: from one machine every RSVP after
// the 20th per hour is a 429 by design. To simulate many distinct guests use
// k6 Cloud (distributed load zones) or count 429s as the limiter working.
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

export const rsvpAccepted = new Rate("rsvp_accepted");

export const options = {
  scenarios: {
    viral_invite: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 400,
      stages: [
        { target: 30, duration: "1m" }, // ~2x the expected peak of a large wedding's guests opening the link
        { target: 60, duration: "2m" },
        { target: 0, duration: "30s" },
      ],
    },
  },
  thresholds: {
    "http_req_failed{type:page}": ["rate<0.01"],
    "http_req_duration{type:page}": ["p(95)<800"],
    "http_req_duration{type:rsvp}": ["p(95)<1200"],
  },
};

const BASE = __ENV.BASE_URL;
const SLUG = __ENV.SLUG;

export default function viralInvite() {
  const page = http.get(`${BASE}/invite/${SLUG}`, { tags: { type: "page" } });
  check(page, { "invite page 200": (r) => r.status === 200 });
  sleep(Math.random() * 3);

  if (Math.random() < 0.3) {
    const res = http.post(
      `${BASE}/api/invite/${SLUG}/rsvp`,
      JSON.stringify({ full_name: `Loadtest Guest ${__VU}-${__ITER}`, attending: Math.random() < 0.8, party_size: 1 + (__ITER % 3) }),
      { headers: { "Content-Type": "application/json", Origin: BASE }, tags: { type: "rsvp" } },
    );
    rsvpAccepted.add(res.status === 200);
    check(res, { "rsvp answered (200 or rate-limited 429)": (r) => r.status === 200 || r.status === 429 });
  }
}
