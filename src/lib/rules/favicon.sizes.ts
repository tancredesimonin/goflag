import type { Rule } from "./types";

const REQUIRED_SIZES = [
  { width: 32, height: 32, label: "32×32 (browser tab)" },
  { width: 180, height: 180, label: "180×180 (apple-touch-icon)" },
];

function hasSize(
  icons: Array<{ parsedSizes: Array<{ width: number; height: number } | "any"> }>,
  required: { width: number; height: number },
): boolean {
  return icons.some((icon) =>
    icon.parsedSizes.some(
      (s) =>
        s === "any" ||
        (typeof s === "object" && s.width === required.width && s.height === required.height),
    ),
  );
}

const rule: Rule = {
  id: "favicon.sizes",
  severity: "info",
  docs: {
    summary: "Ship the canonical favicon sizes (`32×32`, `180×180`, plus an SVG when possible)",
    rationale: `The favicon ecosystem hasn't simplified — every OS still picks a
different size when surfacing your site. The minimum kit that covers
the platforms users actually use is:

- **32×32** (\`<link rel="icon" sizes="32x32">\`) — desktop tabs, search
  result favicons.
- **180×180** (\`<link rel="apple-touch-icon">\`) — iOS home screen,
  Safari pinned tabs, macOS Dock.

A single SVG icon (\`<link rel="icon" type="image/svg+xml">\`) covers
modern browsers and scales perfectly to high-DPI displays, but doesn't
remove the need for the rasterised sizes above for legacy clients.

This rule fires when one of the required sizes is missing.`,
  },
  check: ({ page, issue }) => {
    const icons = page.links.icons;
    if (icons.length === 0) {
      return issue({
        message: "Page declares no favicons at all.",
        origin: { kind: "link", rel: "icon" },
      });
    }
    const issues = [];
    for (const required of REQUIRED_SIZES) {
      if (hasSize(icons, required)) continue;
      issues.push(
        issue({
          message: `Missing favicon size: ${required.label}.`,
          origin: { kind: "link", rel: "icon" },
        }),
      );
    }
    return issues;
  },
};

export default rule;
