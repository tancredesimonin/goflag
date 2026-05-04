export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6 py-24">
      <span className="text-muted-foreground inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs tracking-wider uppercase">
        Pre-alpha · Phase 0
      </span>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Headlint — <span className="text-muted-foreground">Lighthouse for the &lt;head&gt;.</span>
      </h1>
      <p className="text-muted-foreground max-w-xl text-lg">
        A dev-grade linter for how your site appears in search and social. Local-first, runnable in
        CI, with a side-by-side diff between localhost and production.
      </p>
      <p className="text-muted-foreground/70 text-sm">
        The product is bootstrapping. Follow progress in <code>PLAN.md</code>.
      </p>
    </main>
  );
}
