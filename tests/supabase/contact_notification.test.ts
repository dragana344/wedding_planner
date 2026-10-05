import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { submitContactMessage } from "@/lib/venue/contact";

// OBS-005: each contact submission is emailed to the team through Resend;
// a mail outage never fails the (already stored) submission.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const realFetch = globalThis.fetch;

function resendMock(status: number) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith("https://api.resend.com/")) return new Response("{}", { status });
    return realFetch(input, init);
  });
}

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Каде си? <no-reply@mail.example.com>";
  process.env.CONTACT_NOTIFY_EMAIL = "team@example.com";
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.CONTACT_NOTIFY_EMAIL;
  await admin.from("contact_submissions").delete().like("email", "obs005-%");
});

describe("contact form notification (OBS-005)", () => {
  it("emails the team with the sender as reply-to", async () => {
    const fetchMock = resendMock(200);
    globalThis.fetch = fetchMock as typeof fetch;
    await submitContactMessage({ name: "Нова Сала", email: "obs005-a@example.com", message: "Интерес за платформата" });

    const call = fetchMock.mock.calls.find(([url]) => String(url).startsWith("https://api.resend.com/"));
    expect(call).toBeTruthy();
    const payload = JSON.parse(String(call![1]!.body));
    expect(payload).toMatchObject({ to: ["team@example.com"], reply_to: "obs005-a@example.com" });
    expect(payload.text).toContain("Интерес за платформата");
  });

  it("still stores the message and succeeds when the mail provider is down", async () => {
    globalThis.fetch = resendMock(503) as typeof fetch;
    await expect(
      submitContactMessage({ name: "Друга Сала", email: "obs005-b@example.com", message: "Порака" }),
    ).resolves.toBeUndefined();
    const { data } = await admin.from("contact_submissions").select("id").eq("email", "obs005-b@example.com");
    expect(data).toHaveLength(1);
  });
});
