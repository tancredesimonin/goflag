/**
 * Helpers shared by every suggestion template.
 *
 * The templates emit JSON-LD blocks as pretty-printed strings (so the
 * Suggestions UI can syntax-highlight them and offer a one-click
 * "Copy snippet"). Two utilities live here so each template stays
 * focused on the schema.org shape rather than string formatting:
 *
 *   - `renderJsonLd(value)`: pretty-print a JSON-LD object the way
 *     Google's structured-data testing tool does (2-space indent,
 *     trailing newline, `@context` + `@type` first, no escape
 *     gymnastics for non-ASCII characters).
 *
 *   - `wrapAsScript(payload)`: wrap the rendered JSON-LD inside a
 *     `<script type="application/ld+json">` tag so the snippet is
 *     paste-ready into a page's `<head>`.
 */

const KEY_PRIORITY = new Map<string, number>([
  ["@context", 0],
  ["@type", 1],
  ["@id", 2],
]);

function priority(key: string): number {
  return KEY_PRIORITY.get(key) ?? 100;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortKeys(obj[k]);
  return out;
}

export function renderJsonLd(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

export function wrapAsScript(payload: unknown): string {
  return `<script type="application/ld+json">\n${renderJsonLd(payload)}</script>\n`;
}
