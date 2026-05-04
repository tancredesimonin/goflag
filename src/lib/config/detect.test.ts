import { describe, expect, it } from "vitest";

import { detectFrameworkFromManifest } from "./detect";

describe("detectFrameworkFromManifest", () => {
  it("detects Next when `next` is in dependencies", () => {
    expect(detectFrameworkFromManifest({ dependencies: { next: "^15.1.0" } })).toBe("next");
  });

  it("detects Astro from devDependencies", () => {
    expect(detectFrameworkFromManifest({ devDependencies: { astro: "^5.0.0" } })).toBe("astro");
  });

  it("detects Nuxt from either `nuxt` or `nuxt3` dep", () => {
    expect(detectFrameworkFromManifest({ dependencies: { nuxt: "^3" } })).toBe("nuxt");
    expect(detectFrameworkFromManifest({ devDependencies: { nuxt3: "^3" } })).toBe("nuxt");
  });

  it("detects SvelteKit", () => {
    expect(
      detectFrameworkFromManifest({
        devDependencies: { "@sveltejs/kit": "^2.0.0" },
      }),
    ).toBe("sveltekit");
  });

  it("detects Remix", () => {
    expect(
      detectFrameworkFromManifest({
        dependencies: { "@remix-run/react": "^2.0.0" },
      }),
    ).toBe("remix");
  });

  it("detects Vite-React when both vite and the react plugin are present", () => {
    expect(
      detectFrameworkFromManifest({
        devDependencies: { vite: "^6.0.0", "@vitejs/plugin-react": "^4.0.0" },
      }),
    ).toBe("vite-react");
  });

  it("returns `unknown` when no framework dep matches", () => {
    expect(detectFrameworkFromManifest({ dependencies: { lodash: "*" } })).toBe("unknown");
  });

  it("when both Next and Remix are present, Next wins (more useful snippets)", () => {
    expect(
      detectFrameworkFromManifest({
        dependencies: { next: "^15", "@remix-run/react": "^2" },
      }),
    ).toBe("next");
  });
});
