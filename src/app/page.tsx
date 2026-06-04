import Link from "next/link";
import { FileText, Link2, Map as MapIcon } from "lucide-react";
import { UrlForm } from "@/components/inspect/url-form";
import { AuditForm } from "@/components/dashboard/audit-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default function HomePage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border/40 flex items-center justify-between border-b px-6 py-3">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Goflag
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/site" className="text-muted-foreground hover:text-foreground">
            Sitemap
          </Link>
          <Link href="/links" className="text-muted-foreground hover:text-foreground">
            Links
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-8 px-6 py-16">
        <span className="text-muted-foreground inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs tracking-wider uppercase">
          Pre-alpha · Suite
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Goflag &mdash;{" "}
          <span className="text-muted-foreground">a three-lens local site auditor.</span>
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg">
          Enter a base URL once. Goflag audits your <strong>sitemap</strong> discoverability, your{" "}
          <strong>head</strong> presentation in search &amp; social, and your <strong>link</strong>{" "}
          integrity — all locally, no account, no telemetry.
        </p>

        <section className="w-full" aria-labelledby="audit-heading">
          <h2 id="audit-heading" className="mb-3 text-sm font-medium tracking-wide uppercase">
            Audit a site
          </h2>
          <AuditForm />
          <div className="text-muted-foreground/80 mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <span className="flex items-center gap-1.5">
              <MapIcon className="size-3.5" /> Sitemap health &amp; reachability
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="size-3.5" /> Head / meta &amp; social previews
            </span>
            <span className="flex items-center gap-1.5">
              <Link2 className="size-3.5" /> Broken internal &amp; external links
            </span>
          </div>
        </section>

        <section className="w-full" aria-labelledby="inspect-heading">
          <h2 id="inspect-heading" className="mb-3 text-sm font-medium tracking-wide uppercase">
            Or inspect a single URL
          </h2>
          <UrlForm />
          <p className="text-muted-foreground/80 mt-2 text-xs">
            Goflag fetches the page, parses it, and (for SPAs) re-renders it in headless Chromium to
            capture client-injected metadata.
          </p>
        </section>
      </main>

      <footer className="text-muted-foreground/60 border-border/40 border-t px-6 py-4 text-xs">
        Open-source, MIT-licensed. Follow progress in <code>PLAN.md</code>.
      </footer>
    </div>
  );
}
