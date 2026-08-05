import { allDocs } from "content-collections";

import { ogImage } from "@/lib/seo/og";

/**
 * Preview cards for the documentation, one per page.
 *
 * A route handler rather than an `opengraph-image` file because the docs are a
 * single catch-all route and Next refuses to place a metadata image under one.
 * The slug is looked up in the collection instead of the title being passed in a
 * query string, so this cannot be used to render arbitrary text on a goflag
 * card, and every response is prerendered.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return allDocs.map((doc) => ({ slug: doc.slug.split("/") }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const doc = allDocs.find((entry) => entry.slug === slug.join("/"));

  if (!doc) {
    return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain" } });
  }

  return ogImage({ title: doc.title, subtitle: doc.description, label: "docs" });
}
