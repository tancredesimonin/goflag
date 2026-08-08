import { allDocs } from "content-collections";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocsPage } from "@/components/docs/docs-page";
import { Mdx } from "@/components/docs/mdx";
import { docsHref } from "@/lib/docs-nav";
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
