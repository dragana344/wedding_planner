import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

import "@testing-library/jest-dom/vitest";

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
