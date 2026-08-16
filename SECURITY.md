# Security Policy

## Reporting a vulnerability

**Email <hello@goflag.tech>.** Please do not open a public issue for a
vulnerability — an issue is indexed before it is read.

If GitHub's private vulnerability reporting is enabled on this mirror, the
**Report a vulnerability** button under the Security tab works too and is the
better channel: it keeps the thread attached to the repository.

Include what you would want to receive: the version, the command, and the
smallest thing that reproduces it. A reduced HTML file or a fixture site is
worth more than a description.

You can expect an acknowledgement within a few days. This is a small project
maintained by one person — that is a realistic timeline rather than a service
commitment. If a report leads to a fix, you will be credited in the changelog
unless you would rather not be.

## Supported versions

The latest published minor of each package, and nothing behind it. `@goflag/cli`
and `@goflag/next` ship on their own version lines and are supported
independently. Fixes land in a new patch release rather than in a backport.

## What the threat model actually is

Both packages are developer tooling, and the interesting surface is not what
most people expect, so it is worth stating.

**`@goflag/cli` fetches URLs you point it at, and then follows what it finds.**
It parses `robots.txt`, sitemaps — including nested sitemap indexes — HTML,
JSON-LD and Web App Manifests, and it probes the links and assets those
documents declare. Every one of those inputs is attacker-controlled if the site
under audit is hostile. So the things worth reporting are:

- A crafted page, sitemap or `robots.txt` that makes goflag hang, exhaust
  memory, or recurse without bound.
- Anything that makes it write outside the paths it was asked to write to, or
  read a file it was not asked to read.
- Anything that makes it reach a host the audited site did not legitimately
  declare — in particular a redirect or a sitemap entry that pulls the crawl to
  another origin.
- Anything that gets a value out of a crawled page and into the report, or into
  a shell, in a form that executes.

**`@goflag/next` has no runtime dependencies at all** — that is invariant I1,
enforced by a package manifest with an empty `dependencies` and `next` as a
peer. It computes strings from a route registry you write yourself. If you find
a way for it to emit something into `<head>`, `sitemap.xml` or `robots.txt` that
escapes the context it is written into, that is a real finding.

**goflag sends no credentials and has no telemetry.** It does not authenticate,
it collects nothing, and it reports nowhere. If you observe otherwise, that is
by definition a vulnerability and the most urgent thing on this page.

## Out of scope

- Findings against the audited site rather than against goflag. Reporting those
  is what the tool is for — they belong in the report, not here.
- Vulnerabilities in a transitive dependency with no path from goflag's own use
  of it. Send them anyway if you are unsure; a dependency advisory that does
  reach us is in scope.
- Anything requiring an attacker who already controls the machine running the
  audit.
