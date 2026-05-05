/**
 * Stable route keys + safe filenames for snapshot files.
 *
 * The Phase 9 differential CI runner matches snapshots across two
 * commits by `Snapshot.route`. Two URLs that name the same logical
 * page must therefore produce the same key — even when the host,
 * port, scheme, query string, or trailing slash differ between dev
 * and CI. This module is the single source of that mapping.
 */

/**
 * Map a URL to a stable, host-free route key.
 *
 * Rules:
 *   - Strip scheme, host, port, query string, and fragment.
 *   - Collapse the empty pathname (`""` from `https://x.com`) to `"/"`.
 *   - Strip trailing slashes (except the lone `"/"` for the home).
 *   - Decode `%2F` etc. via `decodeURIComponent` so the user-visible
 *     route is what we store, not the wire form.
 *
 * Throws when `input` is not parseable as an absolute URL — the
 * caller is the CLI / UI, both of which already validate URLs upstream.
 */
export function urlToRoute(input: string): string {
  const url = new URL(input);
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed escape sequence — keep the raw pathname rather than
    // throwing in a hot path. The user will see the encoded route.
  }
  if (path.length > 1 && path.endsWith("/")) {
    path = path.replace(/\/+$/, "");
  }
  return path;
}

/**
 * Convert a route key to a filesystem-safe filename (without extension).
 *
 * The home route `/` is reserved as `_root`. Every other route is
 * URL-encoded segment-by-segment, then segments are joined with `_`.
 * That keeps the filename flat (no nested directories per route) and
 * cross-platform safe (Windows forbids `:`, macOS doesn't, ext4
 * doesn't, NTFS doesn't allow `?`, etc.).
 *
 * The encoder uses `encodeURIComponent` per segment so non-ASCII
 * characters become well-formed UTF-8 byte sequences (`é → %C3%A9`),
 * matching the same byte-level scheme the rest of the web uses.
 */
export function routeToFilename(route: string): string {
  if (route === "/") return "_root";
  // `urlToRoute` always returns either `/` or a path starting with `/`,
  // so the leading-slash strip is unconditional.
  return route.slice(1).split("/").map(encodeSegment).join("_");
}

/**
 * Inverse of `routeToFilename` — reconstruct the route from the
 * filename. The transform is `_` → `/`, then `decodeURIComponent`.
 */
export function filenameToRoute(filename: string): string {
  if (filename === "_root") return "/";
  const segments = filename.split("_").map((seg) => {
    try {
      return decodeURIComponent(seg);
    } catch {
      return seg;
    }
  });
  return `/${segments.join("/")}`;
}

/**
 * Encode a single pathname segment for use as part of a filename.
 *
 * `[A-Za-z0-9._-]` pass through unchanged; everything else is
 * percent-encoded using UTF-8 byte sequences (delegated to
 * `encodeURIComponent`).
 */
function encodeSegment(segment: string): string {
  return segment.replace(/[^A-Za-z0-9._-]/g, (ch) => encodeURIComponent(ch));
}
