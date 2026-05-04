import type { Rule } from "./types";

const rule: Rule = {
  id: "manifest.missing",
  severity: "info",
  docs: {
    summary: "Link to a Web App Manifest so the page is installable + themable on mobile",
    rationale: `\`<link rel="manifest">\` declares the document's
[Web App Manifest](https://developer.mozilla.org/docs/Web/Manifest) —
the JSON file that controls install prompts, theme colour on Android
Chrome's address bar, the splash screen, the app name on the user's
home screen, and PWA-ness in general.

This is firmly an **info**-level finding: most marketing pages don't
need a manifest. But its absence on a serious app surface (anything
expecting repeat visits from mobile) usually means missed branding
opportunities, which is worth surfacing.`,
    exampleFix: {
      title: "Link the manifest from <head>",
      language: "html",
      snippet: `<link rel="manifest" href="/site.webmanifest">`,
    },
  },
  check: ({ page, issue }) => {
    if (page.links.manifest) return;
    return issue({
      message: 'Page has no `<link rel="manifest">`.',
      origin: { kind: "link", rel: "manifest" },
    });
  },
};

export default rule;
