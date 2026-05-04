import Link from "next/link";
import { UrlForm } from "@/components/inspect/url-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default function HomePage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border/40 flex items-center justify-between border-b px-6 py-3">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Headlint
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-8 px-6 py-16">
        <span className="text-muted-foreground inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs tracking-wider uppercase">
          Pre-alpha · Phase 3
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Headlint &mdash;{" "}
          <span className="text-muted-foreground">Lighthouse for the &lt;head&gt;.</span>
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg">
          Lint how your site appears in search and social. Local-first, runnable in CI, with a
          side-by-side diff between localhost and production.
        </p>

        <section className="w-full" aria-labelledby="inspect-heading">
          <h2 id="inspect-heading" className="mb-3 text-sm font-medium tracking-wide uppercase">
            Inspect a URL
          </h2>
          <UrlForm />
          <p className="text-muted-foreground/80 mt-2 text-xs">
            Headlint fetches the page, parses it, and (for SPAs) re-renders it in headless Chromium
            to capture client-injected metadata.
          </p>
        </section>
      </main>

      <footer className="text-muted-foreground/60 border-border/40 border-t px-6 py-4 text-xs">
        Open-source, MIT-licensed. Follow progress in <code>PLAN.md</code>.
      </footer>
    </div>
  );
}
