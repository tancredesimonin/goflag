import { OG_CONTENT_TYPE, OG_SIZE } from "@goflag/og";
import { allDocs } from "content-collections";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocsPage } from "@/components/docs/docs-page";
import { Mdx } from "@/components/docs/mdx";
import { docsHref } from "@/lib/docs-nav";
import { ogAlt } from "@/lib/seo/og";
import { routes } from "@/lib/seo/site";

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

function findDoc(slug?: string[]) {
  const path = slug?.join("/") ?? "index";
  return allDocs.find((doc) => doc.slug === path);
}

export function generateStaticParams() {
  return allDocs.map((doc) => ({
    slug: doc.slug === "index" ? [] : doc.slug.split("/"),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const doc = findDoc((await params).slug);
  if (!doc) return {};

  return routes.metadata({
    path: docsHref(doc.slug),
    title: doc.title,
    description: doc.description,
    // Measured, not assumed: `OG_SIZE` and `OG_CONTENT_TYPE` are the same two
    // constants `ogCatchAllRoute` renders this card with, so the declaration
    // and the picture cannot disagree. The library stopped inventing them —
    // `@goflag/next` used to attach 1200×630 to any path it was handed.
    //
    // The `alt` too: the catch-all carries none of its own, so without this the
    // docs shipped the page's title where every other card ships a sentence
    // describing the picture.
    image: {
      url: `/og/docs/${doc.slug}`,
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      type: OG_CONTENT_TYPE,
      alt: ogAlt(doc.title),
    },
    og: { modifiedTime: doc.updated },
  });
}

export default async function DocPage({ params }: PageProps) {
  const doc = findDoc((await params).slug);
  if (!doc) notFound();

  const href = docsHref(doc.slug);

  return (
    <DocsPage
      title={doc.title}
      description={doc.description}
      href={href}
      raw={{ markdown: doc.rawBody, path: `/raw${href === "/docs" ? "/docs/index" : href}.md` }}
    >
      <Mdx code={doc.content} />
    </DocsPage>
  );
}
