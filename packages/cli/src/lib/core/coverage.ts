/**
 * Choosing which pages to audit, by the shape of the site rather than by a cap.
 *
 * `--max-pages` answers "how many" and never "which". On a site of 4451 pages
 * built from about thirty templates it audits the first two hundred the crawl
 * reaches, which is four templates out of thirty — and it cuts through the
 * middle of a family, so the two hundred are neither a sample nor a subset of
 * anything meaningful.
 *
 * This picks by structure instead: every page that stands alone, and a handful
 * from each family of pages that share a template. Design and the measurements
 * behind it: `docs/coverage-plan.md`.
 */

/** A group of URLs that share a path shape, and therefore a template. */
export interface RouteFamily {
  /** The shape, with variable segments replaced: `/{locale}/blog/{2}`. */
  pattern: string;
  /** How many URLs matched it. */
  size: number;
  /** How many of them were selected. */
  sampled: number;
}

export interface CoverageSelection {
  /** The URLs to crawl and audit, in the order they were given. */
  urls: string[];
  /** Every family found, largest first. Families of one are omitted. */
  families: RouteFamily[];
  /** Total URLs considered. */
  total: number;
}

export interface SelectOptions {
  /** Locale segments to fold into `{locale}`, so translations share a family. */
  locales?: readonly string[];
  /** How many URLs to keep per family. */
  perFamily?: number;
  /** Below this many URLs, a group is not a family and is kept whole. */
  threshold?: number;
}

/**
 * `k=3`, and the reasoning is the whole reason it is not 1.
 *
 * A family is homogeneous in what its template produces — the canonical, the
 * hreflang cluster, whether there is an `og:image`. It is not homogeneous in
 * what the content brings: `title.length` and `description.length` judge the
 * copy, and one sample sits wherever it happens to sit in that distribution.
 * Three catch a tail that one misses.
 */
const DEFAULT_PER_FAMILY = 3;

/**
 * Eight, because below it the saving does not pay for the weakened promise.
 * Sampling three of five pages costs the guarantee on two and saves two
 * fetches.
 */
const DEFAULT_THRESHOLD = 8;

/** Path segments, without the leading empty one. */
function segments(url: string): string[] {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The shape of a URL, with locale segments folded.
 *
 * Folding the locale is what makes `/en/blog/x` and `/fr/blog/x` one family
 * rather than two, which matters because they are one template. They are still
 * sampled separately — see `keyOf` — since the copy differs and the copy is
 * what the length rules judge.
 */
function shapeOf(parts: readonly string[], locales: ReadonlySet<string>): string[] {
  return parts.map((part) => (locales.has(part.toLowerCase()) ? "{locale}" : part));
}

/**
 * Group URLs by the shape they share once their variable segment is blanked.
 *
 * A segment is variable at depth `d` when many URLs agree on everything before
 * `d` and disagree at `d`. That is inferred rather than declared, because
 * goflag audits sites it did not produce and cannot ask them for their routes.
 */
function patternOf(parts: readonly string[], varDepths: ReadonlySet<string>): string {
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    // Keyed on the raw prefix, which is how `childrenByPrefix` indexed it. An
    // earlier substitution must not change the key, or every depth past the
    // first variable one stops matching and nothing collapses.
    const prefix = parts.slice(0, i).join("/");
    out.push(varDepths.has(`${i}:${prefix}`) ? `{${i}}` : parts[i]!);
  }
  return `/${out.join("/")}`;
}

/**
 * Pick representatives from a sorted list: first, last, and evenly spaced
 * middles.
 *
 * Deterministic on purpose. A random sample would make two runs of the same
 * site incomparable, which is the defect this whole file exists to avoid
 * repeating — the report has to be diffable against a baseline or it is not a
 * gate.
 */
function representatives(sorted: readonly string[], k: number): string[] {
  if (sorted.length <= k) return [...sorted];
  if (k <= 1) return [sorted[0]!];

  const picked: string[] = [];
  for (let i = 0; i < k; i += 1) {
    picked.push(sorted[Math.round((i * (sorted.length - 1)) / (k - 1))]!);
  }
  return [...new Set(picked)];
}

export function selectByStructure(
  urls: readonly string[],
  options: SelectOptions = {},
): CoverageSelection {
  const perFamily = options.perFamily ?? DEFAULT_PER_FAMILY;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const locales = new Set((options.locales ?? []).map((l) => l.toLowerCase()));

  const parsed = urls.map((url) => ({ url, parts: shapeOf(segments(url), locales) }));

  // Which (depth, prefix) pairs vary. A prefix whose children are many and
  // distinct is a dynamic segment; one with a handful of children is a
  // hand-written menu and every item deserves its own look.
  const childrenByPrefix = new Map<string, Set<string>>();
  for (const { parts } of parsed) {
    for (let i = 0; i < parts.length; i += 1) {
      const key = `${i}:${parts.slice(0, i).join("/")}`;
      const set = childrenByPrefix.get(key) ?? new Set<string>();
      set.add(parts[i]!);
      childrenByPrefix.set(key, set);
    }
  }

  // The first real segment is never variable, however many children it has.
  //
  // Those are the site's top-level sections — `/blog`, `/glossary`, `/stet`.
  // A dozen of them crosses the threshold and would collapse into one pattern,
  // which reads as one family and is a dozen different templates.
  //
  // Which depth that is depends on the site: on a localised one the locale
  // occupies depth 0, so the sections are at depth 1; without a locale prefix
  // they are at depth 0. Protecting depth 1 unconditionally would exempt
  // `/blog/{slug}` on every unlocalised site and the feature would do nothing
  // there.
  const varDepths = new Set<string>();
  for (const [key, children] of childrenByPrefix) {
    const colon = key.indexOf(":");
    const depth = Number(key.slice(0, colon));
    const prefix = key.slice(colon + 1);

    const isFirstSection = depth === 0 || (depth === 1 && prefix === "{locale}");
    if (isFirstSection) continue;
    if (children.size >= threshold) varDepths.add(key);
  }

  // Group, then sample. The locale is part of the grouping key even though it
  // is not part of the pattern: one template, four translations, and the copy
  // rules judge each translation on its own words.
  const groups = new Map<string, { pattern: string; urls: string[] }>();
  for (const { url, parts } of parsed) {
    const pattern = patternOf(parts, varDepths);
    const localePart = segments(url).find((p) => locales.has(p.toLowerCase())) ?? "";
    const key = `${localePart}|${pattern}`;
    const group = groups.get(key) ?? { pattern, urls: [] };
    group.urls.push(url);
    groups.set(key, group);
  }

  const keep = new Set<string>();
  const families = new Map<string, RouteFamily>();

  for (const { pattern, urls: groupUrls } of groups.values()) {
    // No shallowness test here. The root and the first section are already
    // protected above, by never being marked variable — so they each get a
    // pattern of their own, a group of one, and are kept by the size test
    // below. A second guard on pattern depth looked like the same rule and was
    // not: `/blog/{slug}` is two segments deep on a site with no locale
    // prefix, and it exempted exactly the family the feature exists to sample.
    const sorted = [...groupUrls].sort();
    const chosen = sorted.length < threshold ? sorted : representatives(sorted, perFamily);
    for (const url of chosen) keep.add(url);

    if (sorted.length >= threshold) {
      const seen = families.get(pattern);
      families.set(pattern, {
        pattern,
        size: (seen?.size ?? 0) + sorted.length,
        sampled: (seen?.sampled ?? 0) + chosen.length,
      });
    }
  }

  return {
    urls: urls.filter((url) => keep.has(url)),
    families: [...families.values()].sort((a, b) => b.size - a.size),
    total: urls.length,
  };
}
