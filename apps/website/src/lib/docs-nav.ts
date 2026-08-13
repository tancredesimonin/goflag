import { allDocs } from "content-collections";

export interface DocsNavItem {
  title: string;
  href: string;
  description: string;
}

export interface DocsNavGroup {
  id: "start" | "use" | "reference" | "library";
  title: string;
  items: DocsNavItem[];
}

/**
 * `library` comes last on purpose. The CLI is what a reader arrives for, and
 * `@goflag/next` only makes sense once they know what it is producing for.
 */
const GROUP_TITLES: Record<DocsNavGroup["id"], string> = {
  start: "Getting started",
  use: "Using it",
  reference: "Reference",
  library: "The Next.js library",
};

/**
 * Two documentation pages are generated from data rather than written as MDX —
 * the CLI reference from `cli-reference.ts` and the rule catalogue from
 * `rules-catalog.ts` — so they have no frontmatter to be picked up from
 * `content/docs`. They are declared here to sit in the same sidebar as the rest.
 */
const GENERATED: ReadonlyArray<DocsNavItem & { group: DocsNavGroup["id"]; order: number }> = [
  {
    group: "reference",
    order: 0,
    title: "CLI reference",
    href: "/docs/cli",
    description: "Every flag, its default, and what it changes.",
  },
  {
    group: "reference",
    order: 1,
    title: "Rule catalogue",
    href: "/docs/rules",
    description: "Every rule goflag can report, what it checks, and why it matters.",
  },
];

export function docsHref(slug: string): string {
  return slug === "index" ? "/docs" : `/docs/${slug}`;
}

export function getDocsNav(): DocsNavGroup[] {
  const entries = [
    ...allDocs.map((doc) => ({
      group: doc.group,
      order: doc.order,
      title: doc.navTitle ?? doc.title,
      href: docsHref(doc.slug),
      description: doc.description,
    })),
    ...GENERATED,
  ];

  return (["start", "use", "reference", "library"] as const)
    .map((id) => ({
      id,
      title: GROUP_TITLES[id],
      items: entries
        .filter((entry) => entry.group === id)
        .sort((a, b) => a.order - b.order)
        .map(({ title, href, description }) => ({ title, href, description })),
    }))
    .filter((group) => group.items.length > 0);
}

/** Previous/next across the whole sidebar, in reading order. */
export function getDocsSequence(): DocsNavItem[] {
  return getDocsNav().flatMap((group) => group.items);
}

export function getDocsNeighbours(href: string): {
  previous: DocsNavItem | null;
  next: DocsNavItem | null;
} {
  const sequence = getDocsSequence();
  const index = sequence.findIndex((item) => item.href === href);

  if (index === -1) return { previous: null, next: null };

  return {
    previous: sequence[index - 1] ?? null,
    next: sequence[index + 1] ?? null,
  };
}

/**
 * Which sidebar entry a path lights up: the **longest** one that matches.
 *
 * Marking every entry whose href is a prefix of the path lights two at once as
 * soon as the sidebar nests — on `/docs/next/routes`, both `/docs/next` and
 * `/docs/next/routes` claim to be the page you are on, and a reader loses the
 * one signal the sidebar owes them.
 *
 * The prefix rule is still needed, because pages exist that the sidebar does
 * not list: a rule page (`/docs/rules/title.missing`) has to keep the catalogue
 * entry highlighted. Taking the longest match serves both — the listed child
 * wins where there is one, its parent wins where there is not.
 *
 * `/docs` stays out of the prefix rule. It is a prefix of every page here, and
 * lighting the index up underneath a more specific page it does not contain was
 * the defect this replaced.
 */
export function activeDocsHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;

  for (const href of hrefs) {
    const matches = pathname === href || (href !== "/docs" && pathname.startsWith(`${href}/`));
    if (!matches) continue;
    if (best === null || href.length > best.length) best = href;
  }

  return best;
}
