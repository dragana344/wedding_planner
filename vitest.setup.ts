import "@testing-library/jest-dom/vitest";

// Unit tests never talk to Supabase, but some modules build a client at import
// time and need these to be set. Placeholders only - no env file is loaded
// here, so nothing can point the test run at a real project.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "unit-test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "unit-test-service-role-key";

// Belt and braces for DATA-008: whatever the environment says, a test run must
// never be pointed at a hosted Supabase project.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
  throw new Error(
    `Refusing to run tests against non-local Supabase (${process.env.NEXT_PUBLIC_SUPABASE_URL}). ` +
      "Point NEXT_PUBLIC_SUPABASE_URL at a local instance (supabase start) to run the test suite.",
  );
}

// jsdom does not implement PointerEvent (as of jsdom 24), so pointer-based
// drag/resize interactions can't be exercised via fireEvent.pointerDown/Move/Up
// without this minimal polyfill. It only carries the properties our components
// and tests rely on (clientX/clientY via MouseEvent, plus pointerId).
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    public pointerId: number;
    public pointerType: string;
    public isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? true;
    }
  }

  // @ts-expect-error -- assigning a polyfill for a constructor jsdom doesn't provide
  window.PointerEvent = PointerEventPolyfill;
}
