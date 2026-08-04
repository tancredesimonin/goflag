import { defineCollection, defineConfig } from "@content-collections/core";
import { compileMDX, type Options } from "@content-collections/mdx";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { z } from "zod";

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
  transform: async (document, context) => ({
    ...document,
    // `_meta.path` is the path under `content/docs` without the extension,
    // which is exactly the URL tail: `ci/baseline.mdx` → `ci/baseline`.
    slug: document._meta.path,
    rawBody: document.content,
    content: await compileMDX(context, document, mdxOptions),
  }),
});

const legal = defineCollection({
  name: "legal",
  directory: "content/legal",
  include: "**/*.mdx",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    locale: z.enum(["en", "fr", "es", "pt-br"]),
    slug: z.string(),
    lastUpdated: z.string(),
    content: z.string(),
  }),
  transform: async (document, context) => ({
    ...document,
    content: await compileMDX(context, document, mdxOptions),
  }),
});

export default defineConfig({
  content: [docs, legal],
});
