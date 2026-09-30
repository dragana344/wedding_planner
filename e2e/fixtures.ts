import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

// Every page is served with Content-Security-Policy-Report-Only (SEC-001),
// which is only safe to enforce once no page violates it. Each E2E test
// therefore fails if the browser reports any CSP violation on any page it
// opened, so a new inline script, third-party host or eval shows up here
// before it can break production under an enforced policy.

export type CspMessage = { page: string; text: string };

const CSP_PATTERN = /Content[- ]Security[- ]Policy/i;

// Not a violation: Chrome's note that a report-only policy cannot upgrade
// requests. The production policy (next.config.mjs) lists
// upgrade-insecure-requests while it is still report-only, so every page load
// prints this once. It is recorded as a test annotation, not a failure; it
// disappears when the policy is enforced (or the directive is dropped from
// the report-only header).
const IGNORED = [/directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy/];

// The browser's own console line ("[Report Only] Refused to load ... because
// it violates the following Content Security Policy directive: ...") plus one
// line per `securitypolicyviolation` event with the exact directive and
// blocked URL, in case the browser does not print a console line for it.
const VIOLATION_LOGGER = `
  document.addEventListener("securitypolicyviolation", (e) => {
    console.warn(
      "[e2e] Content-Security-Policy violation: directive=" + e.violatedDirective +
        " blocked=" + (e.blockedURI || "(none)") +
        " source=" + (e.sourceFile || "(none)") + ":" + e.lineNumber +
        " disposition=" + e.disposition
    );
  });
`;

function watchContext(context: BrowserContext, messages: CspMessage[], ignored: Set<string>) {
  const watchPage = (page: Page) => {
    page.on("console", (msg) => {
      const text = msg.text();
      if (!CSP_PATTERN.test(text)) return;
      if (IGNORED.some((re) => re.test(text))) ignored.add(text);
      else messages.push({ page: page.url(), text });
    });
  };
  context.pages().forEach(watchPage);
  context.on("page", watchPage);
  return context.addInitScript(VIOLATION_LOGGER);
}

type CspWatch = { messages: CspMessage[]; ignored: Set<string> };

type Fixtures = {
  /** CSP console messages seen in this test; any violation fails it afterwards. */
  csp: CspWatch;
  /** A page in a fresh browser context: no venue or couple cookies (a guest). */
  anonPage: Page;
};

/**
 * Each test gets its own client IP (x-real-ip is what the app's rate limiter
 * keys on; locally nothing overwrites it, on Vercel the platform does). The
 * suite signs up more venues than one IP may per hour, and tests must not
 * share rate-limit windows.
 */
function testClientIp(): string {
  return `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${1 + Math.floor(Math.random() * 253)}`;
}

export const test = base.extend<Fixtures>({
  context: async ({ context }, provide) => {
    await context.setExtraHTTPHeaders({ "x-real-ip": testClientIp() });
    await provide(context);
  },

  csp: [
    async ({ context }, provide, testInfo) => {
      const watch: CspWatch = { messages: [], ignored: new Set() };
      await watchContext(context, watch.messages, watch.ignored);
      await provide(watch);
      for (const text of watch.ignored) testInfo.annotations.push({ type: "csp-warning", description: text });
      const { messages } = watch;
      expect(
        messages,
        `CSP violations reported:\n${messages.map((m) => `  ${m.page}\n    ${m.text}`).join("\n")}`,
      ).toEqual([]);
    },
    { auto: true },
  ],

  anonPage: async ({ browser, baseURL, locale, timezoneId, csp }, provide) => {
    const context = await browser.newContext({ baseURL, locale, timezoneId, extraHTTPHeaders: { "x-real-ip": testClientIp() } });
    await watchContext(context, csp.messages, csp.ignored);
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

export { expect };
