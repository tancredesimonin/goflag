import "@testing-library/jest-dom/vitest";

/**
 * jsdom doesn't ship matchMedia. The shadcn sidebar's `useIsMobile` hook
 * subscribes to a media query at mount; without this polyfill every test
 * that renders the sidebar throws inside React's commit phase.
 */
if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

/**
 * jsdom doesn't ship `PointerEvent`. `@base-ui/react`'s Switch dispatches a
 * synthetic PointerEvent on click to differentiate keyboard vs mouse vs
 * touch activation; without this polyfill every test that toggles a Switch
 * throws "ReferenceError: PointerEvent is not defined" inside React's
 * dispatch loop. We only need the constructor signature, not real pointer
 * coordinates — extending Event is enough to make the constructor callable.
 */
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends Event {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "";
      this.isPrimary = init.isPrimary ?? false;
    }
  }
  // Vitest's globalThis is shared with the jsdom window.
  (globalThis as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
    PointerEventPolyfill;
  if (typeof window !== "undefined") {
    (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
      PointerEventPolyfill;
  }
}
