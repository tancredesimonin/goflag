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
    image: `/og/docs/${doc.slug}`,
    // The same sentence every other card on this site carries. These pages
    // cannot use the file convention — Next will not place a metadata image
    // under a catch-all segment — so the alt travels here instead of through
    // `generateImageMetadata`, and it has to say what the picture shows rather
    // than repeat the title.
    imageAlt: ogAlt(doc.title),
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
