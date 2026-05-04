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
