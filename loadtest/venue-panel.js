// TEST-008: a busy venue panel — staff moving between dashboard, calendar,
// events and reservations. Staging only. Needs a staging staff session cookie:
//
//   k6 run -e BASE_URL=https://<staging> -e COOKIE="sb-<ref>-auth-token=...; ..." loadtest/venue-panel.js
//
// (Copy the cookie header from a signed-in browser on staging.)
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 20,
  duration: "3m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
  },
};

const PAGES = ["/venue", "/venue/calendar", "/venue/events", "/venue/reservations", "/venue/clients"];

export default function busyVenuePanel() {
  for (const path of PAGES) {
    const res = http.get(`${__ENV.BASE_URL}${path}`, { headers: { Cookie: __ENV.COOKIE }, redirects: 0 });
    check(res, { [`${path} 200`]: (r) => r.status === 200 });
    sleep(1 + Math.random() * 2);
  }
}
