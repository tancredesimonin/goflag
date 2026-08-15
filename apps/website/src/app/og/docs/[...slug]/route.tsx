import { allDocs } from "content-collections";

import { ogCatchAllRoute } from "@/lib/seo/og";

/**
 * Preview cards for the documentation, one per page.
 *
 * A route handler rather than an `opengraph-image` file because the docs are a
 * single catch-all route and Next refuses to place a metadata image under one.
 * The workaround itself lives in `ogCatchAllRoute`; what stays here is the part
 * that is about this site: which collection, and what goes on the card.
 */
export const dynamic = "force-static";

const route = ogCatchAllRoute({
  entries: allDocs,
  slugOf: (doc) => doc.slug,
  card: (doc) => ({ title: doc.title, subtitle: doc.description, label: "docs" }),
});

export const generateStaticParams = route.generateStaticParams;
export const GET = route.GET;
