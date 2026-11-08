import { Parser } from "htmlparser2";
import type { SitemapAlternate, SitemapUrlEntry } from "./types";

/**
 * Outcome of parsing a single sitemap document. `kind` distinguishes a
 * leaf `<urlset>` (carries page URLs) from a `<sitemapindex>` (carries
 * child sitemap locations the caller must follow). `wellFormed` is false
 * when the body could not be parsed as XML or matched neither root tag.
 */
export type ParsedSitemap =
  | { kind: "urlset"; wellFormed: true; urls: SitemapUrlEntry[] }
  | { kind: "index"; wellFormed: true; sitemaps: string[] }
  | { kind: "unknown"; wellFormed: false; urls: []; sitemaps: [] };

/** A parse fed in chunks: `write` each piece of text as it arrives, then `end`. */
export interface SitemapParser {
  write(chunk: string): void;
  end(): ParsedSitemap;
}

/** The fields of a `<url>` entry read from its first matching descendant. */
type Field = "loc" | "lastmod" | "changefreq" | "priority";
const FIELDS: ReadonlySet<string> = new Set<Field>(["loc", "lastmod", "changefreq", "priority"]);

/** One open `<url>`, while its descendants stream past. */
interface OpenUrl {
  depth: number;
  /** Its place among the entries: the order `<url>`s open in, as `$("url")` walked them. */
  slot: number;
  /** A field's first element decides, even empty: later ones are not read. */
  taken: Set<Field>;
  /** Fields being read now, with the depth of the element being read. */
  reading: Map<Field, { depth: number; text: string }>;
  values: Partial<Record<Field, string>>;
  alternates: SitemapAlternate[];
  seenAlternates: Set<string>;
}

/**
 * Parse a sitemap as it streams, with the `Parser` of htmlparser2 — the
 * tokenizer cheerio itself runs in `xmlMode`, minus the tree.
 *
 * Until 2026-11 this loaded each document whole into cheerio. A sitemap may
 * be 50 MB uncompressed (sitemaps.org), and a DOM of it is several times
 * that; an index of a large site names hundreds of them. Read as events, a
 * document costs the entries it yields and nothing for the markup around
 * them, so memory follows the number of URLs kept, not the size of the files
 * they came in (`docs/integrations-plan.md` T-3, D8).
 *
 * The result is the one the cheerio version gave, selector for selector,
 * because the reports built from it must not move:
 *
 *   - `sitemapindex` anywhere makes the document an index, read from every
 *     `<loc>` that is a direct child of a `<sitemap>` (`sitemap > loc`);
 *   - otherwise `urlset` or `url` anywhere makes it a urlset, and every `<url>`
 *     is an entry whose `loc`, `lastmod`, `changefreq` and `priority` come from
 *     the **first** descendant of that name, its whole text, trimmed. The first
 *     one decides even when it is empty, as `find(...).first()` did;
 *   - tag names match exactly, as cheerio's selectors did in `xmlMode`;
 *   - the alternates are the direct children whose **local name** is `link`,
 *     any case — the one lookup that was namespace-agnostic, because real
 *     sitemaps write `xhtml:link` (see `alternatesOf` in git history: 150 of
 *     them in `fixtures/sites/tancrede/sitemap.xml` used to be dropped).
 *
 * Duplicate `<loc>`s keep their first occurrence, in both kinds.
 */
export function createSitemapParser(): SitemapParser {
  const stack: string[] = [];
  let sawIndex = false;
  let sawUrlset = false;

  const childSitemaps: string[] = [];
  const seenSitemaps = new Set<string>();
  /** `<loc>` directly under a `<sitemap>`, while its text arrives. */
  let sitemapLoc: { depth: number; text: string } | undefined;

  /**
   * One slot per `<url>`, in the order they open, filled when each closes.
   * Only nested `<url>`s close out of that order, but the dedupe below keeps
   * the first occurrence, and "first" has to mean what it meant to cheerio.
   */
  const slots: (SitemapUrlEntry | undefined)[] = [];
  const openUrls: OpenUrl[] = [];

  function finishUrl(open: OpenUrl): void {
    const loc = (open.values.loc ?? "").trim();
    if (!loc) return;
    const entry: SitemapUrlEntry = { loc };
    const lastmod = (open.values.lastmod ?? "").trim();
    if (lastmod) entry.lastmod = lastmod;
    const changefreq = (open.values.changefreq ?? "").trim();
    if (changefreq) entry.changefreq = changefreq;
    const priority = (open.values.priority ?? "").trim();
    if (priority) entry.priority = priority;
    if (open.alternates.length > 0) entry.alternates = open.alternates;
    slots[open.slot] = entry;
  }

  function entries(): SitemapUrlEntry[] {
    const urls: SitemapUrlEntry[] = [];
    const seen = new Set<string>();
    for (const entry of slots) {
      if (!entry || seen.has(entry.loc)) continue;
      seen.add(entry.loc);
      urls.push(entry);
    }
    return urls;
  }

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const parent = stack[stack.length - 1];
        stack.push(name);
        const depth = stack.length;

        if (name === "sitemapindex") sawIndex = true;
        if (name === "urlset") sawUrlset = true;

        if (name === "loc" && parent === "sitemap" && !sitemapLoc) {
          sitemapLoc = { depth, text: "" };
        }

        // Alternates: direct children of a `<url>`, matched on the local name.
        const open = openUrls[openUrls.length - 1];
        if (open && depth === open.depth + 1 && name.split(":").pop()?.toLowerCase() === "link") {
          const rel = (attribs.rel ?? "alternate").trim().toLowerCase();
          const hreflang = (attribs.hreflang ?? "").trim();
          const href = (attribs.href ?? "").trim();
          // A cluster declaring the same tag twice is declaring it once and
          // contradicting itself; the first wins, as everywhere else here.
          const key = `${hreflang.toLowerCase()}\0${href}`;
          if (rel === "alternate" && hreflang && href && !open.seenAlternates.has(key)) {
            open.seenAlternates.add(key);
            open.alternates.push({ hreflang, href });
          }
        }

        // A field element opens a read in every enclosing `<url>` that has not
        // met one of that name yet: `find(name).first()` searches all depths.
        if (FIELDS.has(name)) {
          const field = name as Field;
          for (const url of openUrls) {
            if (url.taken.has(field)) continue;
            url.taken.add(field);
            url.reading.set(field, { depth, text: "" });
          }
        }

        if (name === "url") {
          sawUrlset = true;
          slots.push(undefined);
          openUrls.push({
            depth,
            slot: slots.length - 1,
            taken: new Set(),
            reading: new Map(),
            values: {},
            alternates: [],
            seenAlternates: new Set(),
          });
        }
      },

      ontext(text) {
        if (sitemapLoc) sitemapLoc.text += text;
        for (const url of openUrls) {
          for (const read of url.reading.values()) read.text += text;
        }
      },

      onclosetag() {
        const depth = stack.length;
        const name = stack.pop();

        if (sitemapLoc && sitemapLoc.depth === depth) {
          const loc = sitemapLoc.text.trim();
          if (loc && !seenSitemaps.has(loc)) {
            seenSitemaps.add(loc);
            childSitemaps.push(loc);
          }
          sitemapLoc = undefined;
        }

        for (const url of openUrls) {
          for (const [field, read] of url.reading) {
            if (read.depth !== depth) continue;
            url.values[field] = read.text;
            url.reading.delete(field);
          }
        }

        const open = openUrls[openUrls.length - 1];
        if (name === "url" && open && open.depth === depth) {
          openUrls.pop();
          finishUrl(open);
        }
      },
    },
    // `xmlMode` is what cheerio was given: tag and attribute names keep their
    // case, CDATA is text, and entities are decoded as XML's.
    { xmlMode: true },
  );

  return {
    write(chunk) {
      parser.write(chunk);
    },
    end() {
      // Closes whatever is still open, as the tree builder did, so an entry
      // cut off by the end of the file is still read.
      parser.end();
      if (sawIndex) return { kind: "index", wellFormed: true, sitemaps: childSitemaps };
      if (sawUrlset) return { kind: "urlset", wellFormed: true, urls: entries() };
      return { kind: "unknown", wellFormed: false, urls: [], sitemaps: [] };
    },
  };
}

/**
 * Parse a sitemap XML body into either a list of page URLs (`<urlset>`)
 * or a list of child sitemap URLs (`<sitemapindex>`). For a body already in
 * memory; discovery streams into `createSitemapParser` instead.
 */
export function parseSitemap(body: string): ParsedSitemap {
  const parser = createSitemapParser();
  parser.write(body);
  return parser.end();
}
