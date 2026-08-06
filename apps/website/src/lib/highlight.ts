import { codeToHtml } from "shiki";

/**
 * Highlight a snippet with the same two themes `rehype-pretty-code` uses for
 * MDX, so a fix snippet rendered from `rules-catalog.ts` and one written in a
 * documentation page look identical. `defaultColor: false` emits the
 * `--shiki-light` / `--shiki-dark` custom properties that `globals.css` switches
 * between, rather than baking one theme in.
 */
export function highlight(code: string, lang: string): Promise<string> {
  return codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}
