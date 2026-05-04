import { codeToHtml } from "shiki";

/**
 * Server-side syntax highlighter wrapper. We render shiki on the server so
 * the CLI dump and the inspect page produce identical output without
 * shipping shiki's WASM to the client.
 *
 * shiki's `codeToHtml` is deliberately uncached here — for Phase 3 the
 * payloads are tiny (a handful of `<head>` tags per page). If the watch-mode
 * loop in Phase 10 starts re-highlighting the same page repeatedly, we'll
 * memoize on the line + theme key.
 */
export async function highlightHtml(
  code: string,
  options?: { lang?: string; theme?: "github-dark" | "github-light" },
): Promise<string> {
  return codeToHtml(code, {
    lang: options?.lang ?? "html",
    theme: options?.theme ?? "github-dark",
  });
}
