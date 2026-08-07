import { defineCollection, defineConfig } from "@content-collections/core";
import { compileMDX, type Options } from "@content-collections/mdx";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { z } from "zod";

import { PACKAGE } from "./src/lib/constants";

/**
 * Install snippets in the docs pin the published CLI version. Writing the
 * number into the MDX would let it rot on every release, so the pages carry
 * a `__CLI_VERSION__` token and the real number is substituted at build time
 * from the same constant the rest of the site quotes.
 */
function substituteVersion(content: string): string {
  return content.replaceAll("__CLI_VERSION__", PACKAGE.version);
}

const mdxOptions: Options = {
  remarkPlugins: [remarkGfm],
  rehypePlugins: [
    rehypeSlug,
    [
      rehypePrettyCode,
      {
        theme: { dark: "github-dark", light: "github-light" },
        keepBackground: false,
        defaultLang: "plaintext",
      },
    ],
  ],
};

/**
 * The documentation. English only, and deliberately not under `/[locale]` — a
 * half-translated reference that quietly falls back to English is worse than
 * one that says which language it is in. `rawBody` is kept so the same page can
 * be served as markdown at `/raw/<slug>.md` for agents.
 */
const docs = defineCollection({
  name: "docs",
  directory: "content/docs",
  include: "**/*.mdx",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Sidebar group. Rendered in the order declared by `DOC_GROUPS`. */
    group: z.enum(["start", "use", "reference"]),
    /** Position inside the group. */
    order: z.number(),
    /** Shorter label for the sidebar, when the title is a sentence. */
    navTitle: z.string().optional(),
    updated: z.string().optional(),
    content: z.string(),
  }),
  transform: async (document, context) => {
    const substituted = { ...document, content: substituteVersion(document.content) };
    return {
      ...substituted,
      // `_meta.path` is the path under `content/docs` without the extension,
      // which is exactly the URL tail: `ci/baseline.mdx` → `ci/baseline`.
      slug: document._meta.path,
      rawBody: substituted.content,
      content: await compileMDX(context, substituted, mdxOptions),
    };
  },
});

const legal = defineCollection({
  name: "legal",
  directory: "content/legal",
  include: "**/*.mdx",
  schema: z.object({
    title: z.string(),
    locale: z.enum(["en", "fr", "es", "pt"]),
    slug: z.string(),
    lastUpdated: z.string(),
    content: z.string(),
    seo: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
      })
      .optional(),
  }),
  transform: async (document, context) => ({
    ...document,
    content: await compileMDX(context, document, mdxOptions),
  }),
});

export default defineConfig({
  content: [docs, legal],
});
