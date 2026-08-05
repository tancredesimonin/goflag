import { allDocs } from "content-collections";

/**
 * The markdown source of a documentation page, at `/raw/docs/<slug>.md`.
 *
 * A model asked to read this documentation should not have to strip a sidebar
 * out of an HTML page to do it, and a `<Callout>` in the source is more legible
 * than the div it compiles to. Same content as the rendered page, from the same
 * file, so the two cannot disagree.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return allDocs.map((doc) => ({ path: ["docs", ...doc.slug.split("/")].map(withMdSuffixOnLast) }));
}

function withMdSuffixOnLast(segment: string, index: number, all: string[]): string {
  return index === all.length - 1 ? `${segment}.md` : segment;
}

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const [scope, ...rest] = path;

  if (scope !== "docs" || rest.length === 0) {
    return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain" } });
  }

  const slug = rest.join("/").replace(/\.md$/, "");
  const doc = allDocs.find((entry) => entry.slug === slug);

  if (!doc) {
    return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain" } });
  }

  const body = `# ${doc.title}\n\n> ${doc.description}\n\n${doc.rawBody.trim()}\n`;

  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
