// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

describe("Sentry event scrubbing (OBS-001)", () => {
  it("drops bodies, cookies, headers, query strings, user and slugs; redacts personal fields", () => {
    const event = {
      type: undefined,
      request: {
        method: "POST",
        url: "https://app.example.mk/api/invite/Xy12_abcDEF3/rsvp?ref=mail",
        data: '{"full_name":"Ана Петровска","phone":"+38970111222"}',
        cookies: { couple_session: "secret-token" },
        headers: { cookie: "couple_session=secret-token", "user-agent": "x" },
        query_string: "ref=mail",
      },
      user: { id: "u1", email: "a@b.mk", ip_address: "1.2.3.4" },
      extra: { guest: { full_name: "Ана Петровска", party_size: 2 }, password: "hunter2" },
      breadcrumbs: [{ category: "fetch", data: { url: "/api/invite/Xy12_abcDEF3/rsvp", method: "POST" } }],
    } as unknown as ErrorEvent;

    const raw = JSON.stringify(scrubEvent(event));
    for (const secret of ["Ана Петровска", "+38970111222", "secret-token", "a@b.mk", "1.2.3.4", "hunter2", "Xy12_abcDEF3", "ref=mail"]) {
      expect(raw).not.toContain(secret);
    }
    const scrubbed = scrubEvent(event);
    expect(scrubbed.request).toEqual({ method: "POST", url: "https://app.example.mk/api/invite/:slug/rsvp" });
    expect((scrubbed.extra!.guest as { party_size: number }).party_size).toBe(2);
  });
});
