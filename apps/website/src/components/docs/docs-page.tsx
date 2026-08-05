import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageActions } from "@/components/docs/page-actions";
import { getDocsNeighbours } from "@/lib/docs-nav";

interface DocsPageProps {
  title: string;
  description: string;
  /** This page's own href, used to work out previous/next. */
  href: string;
  /** Markdown source offered to agents, when the page has one. */
  raw?: { markdown: string; path: string };
  breadcrumb?: { label: string; href: string };
  children: ReactNode;
}

export function DocsPage({ title, description, href, raw, breadcrumb, children }: DocsPageProps) {
  const { previous, next } = getDocsNeighbours(href);

  return (
    <article className="max-w-3xl">
      <header className="mb-10">
        {breadcrumb ? (
          <Link
            href={breadcrumb.href}
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeftIcon className="size-3.5" />
            {breadcrumb.label}
          </Link>
        ) : null}

        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="text-muted-foreground mt-4 text-lg leading-relaxed">{description}</p>

        {raw ? <PageActions markdown={raw.markdown} rawPath={raw.path} className="mt-6" /> : null}
      </header>

      {children}

      {previous || next ? (
        <nav
          className="mt-16 grid gap-4 border-t pt-8 sm:grid-cols-2"
          aria-label="Previous and next page"
        >
          {previous ? (
            <Link
              href={previous.href}
              className="hover:border-foreground/30 group rounded-lg border p-4 transition-colors"
            >
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <ArrowLeftIcon className="size-3.5" />
                Previous
              </span>
              <span className="mt-1 block font-medium">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={next.href}
              className="hover:border-foreground/30 group rounded-lg border p-4 text-right transition-colors"
            >
              <span className="text-muted-foreground flex items-center justify-end gap-1.5 text-xs">
                Next
                <ArrowRightIcon className="size-3.5" />
              </span>
              <span className="mt-1 block font-medium">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </article>
  );
}
