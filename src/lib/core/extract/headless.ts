import type { FetchMeta } from "../types";

export interface HeadlessExtractOptions {
  /** Optional User-Agent override. Defaults to a Goflag UA. */
  userAgent?: string;
  /** Per-navigation timeout in ms. Defaults to 30_000 (Chromium can be slow). */
  timeoutMs?: number;
  /** Allow self-signed TLS certs (mirrors `fetchStatic`'s flag). */
  allowInsecureTls?: boolean;
  /** Wait condition after navigation. Defaults to `"networkidle"`. */
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  /** Optional AbortSignal for caller-driven cancellation. */
  signal?: AbortSignal;
  /**
   * Override the launcher used to obtain a Chromium browser. Tests inject a
   * mock launcher to avoid downloading the real binary; production uses the
   * default which lazy-imports `playwright`.
   */
  launcher?: HeadlessLauncher;
}

export interface HeadlessExtractResult {
  /** Final HTML after `waitUntil` was reached. */
  renderedHtml: string;
  /** Network metadata from the navigation. */
  fetch: FetchMeta;
}

/**
 * Minimal interface the headless extractor needs from a browser launcher.
 * Letting tests stub this means we never touch the real Playwright binary
 * in the unit suite — we only verify our orchestration. The real Playwright
 * implementation lives behind `defaultLauncher()` and is lazy-loaded.
 */
export interface HeadlessLauncher {
  launch(opts: { allowInsecureTls?: boolean }): Promise<HeadlessBrowser>;
}

export interface HeadlessBrowser {
  newPage(opts: { userAgent?: string }): Promise<HeadlessPage>;
  close(): Promise<void>;
}

export interface HeadlessPage {
  goto(
    url: string,
    opts: { waitUntil: HeadlessExtractOptions["waitUntil"]; timeoutMs: number },
  ): Promise<HeadlessNavigation>;
  content(): Promise<string>;
  close(): Promise<void>;
}

export interface HeadlessNavigation {
  status: number;
  statusText: string;
  finalUrl: string;
  headers: Record<string, string>;
}

const DEFAULT_UA = "Goflag/0.0 (+https://github.com/tancredesimonin-indie/goflag; headless)";

/**
 * Thrown when Playwright (or its Chromium binary) is not available locally.
 * The CLI catches this and prints a friendly install prompt instead of a
 * stack trace.
 */
export class HeadlessUnavailableError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "HeadlessUnavailableError";
    this.cause = options?.cause;
  }
}

/**
 * Render `url` in Chromium and return the post-hydration HTML.
 *
 * Implementation notes:
 *  - Playwright is loaded lazily via dynamic `import()` so that users who
 *    only ever run `goflag inspect --static` never pay the import cost
 *    (it pulls in ~80 MB of types and ~15 MB of runtime).
 *  - If the import fails (`playwright` not installed) or the browser refuses
 *    to launch (Chromium binary missing), we throw `HeadlessUnavailableError`
 *    with a one-line install command. The CLI prints that and exits 2.
 *  - We accept an `allowInsecureTls` flag for parity with `fetchStatic`, so
 *    self-signed `*.local` hosts work the same in both modes.
 */
export async function extractHeadless(
  url: string,
  options: HeadlessExtractOptions = {},
): Promise<HeadlessExtractResult> {
  const launcher = options.launcher ?? defaultLauncher();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const userAgent = options.userAgent ?? DEFAULT_UA;
  const waitUntil = options.waitUntil ?? "networkidle";

  if (options.signal?.aborted) {
    throw new HeadlessUnavailableError("Headless render cancelled before launch");
  }

  const start = performance.now();
  const browser = await launcher.launch({ allowInsecureTls: options.allowInsecureTls });
  let page: HeadlessPage | undefined;
  try {
    page = await browser.newPage({ userAgent });
    const nav = await page.goto(url, { waitUntil, timeoutMs });
    const body = await page.content();
    const meta: FetchMeta = {
      requestedUrl: url,
      finalUrl: nav.finalUrl,
      status: nav.status,
      statusText: nav.statusText,
      headers: nav.headers,
      redirectCount: 0,
      durationMs: Math.round(performance.now() - start),
      bodyBytes: Buffer.byteLength(body, "utf8"),
      contentType: nav.headers["content-type"]?.split(";")[0]?.trim().toLowerCase(),
    };
    return { renderedHtml: body, fetch: meta };
  } finally {
    await page?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

/**
 * Async loader for the `playwright` module. Defaulted to a real dynamic
 * import; tests pass a custom loader so they can simulate "not installed"
 * without uninstalling the package.
 */
export type PlaywrightLoader = () => Promise<typeof import("playwright")>;

/**
 * Default launcher backed by `playwright`. Lazy-imports the package so the
 * cost is only paid when the user actually asks for headless mode.
 *
 * `loader` is injectable so tests can exercise the friendly install-prompt
 * branches without needing to physically uninstall the package.
 */
export function defaultLauncher(
  loader: PlaywrightLoader = () => import("playwright"),
): HeadlessLauncher {
  return {
    async launch({ allowInsecureTls }) {
      let mod: typeof import("playwright");
      try {
        mod = await loader();
      } catch (err) {
        throw new HeadlessUnavailableError(
          "Headless mode requires the 'playwright' package. Install it with `pnpm add -D playwright` and `pnpm exec playwright install chromium`.",
          { cause: err },
        );
      }

      let pw: import("playwright").Browser;
      try {
        pw = await mod.chromium.launch({
          headless: true,
          args: allowInsecureTls ? ["--ignore-certificate-errors"] : [],
        });
      } catch (err) {
        throw new HeadlessUnavailableError(
          "Could not launch Chromium. Install the browser binary with `pnpm exec playwright install chromium`.",
          { cause: err },
        );
      }

      return {
        async newPage({ userAgent }) {
          const ctx = await pw.newContext({
            userAgent,
            ignoreHTTPSErrors: !!allowInsecureTls,
          });
          const p = await ctx.newPage();
          return {
            async goto(url, opts) {
              const response = await p.goto(url, {
                waitUntil: opts.waitUntil,
                timeout: opts.timeoutMs,
              });
              const status = response?.status() ?? 0;
              const statusText = response?.statusText() ?? "";
              const headers = response ? await response.allHeaders() : {};
              return {
                status,
                statusText,
                finalUrl: p.url(),
                headers,
              };
            },
            async content() {
              return p.content();
            },
            async close() {
              await ctx.close();
            },
          };
        },
        async close() {
          await pw.close();
        },
      };
    },
  };
}
