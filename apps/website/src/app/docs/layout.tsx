import { NextIntlClientProvider } from "next-intl";

import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { HtmlLang } from "@/components/site/html-lang";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getDocsNav } from "@/lib/docs-nav";
import { site } from "@/lib/seo/site";

/**
 * Prerendered, including the root layout above it.
 *
 * That root layout resolves a locale for `<html lang>`, which is a request-time
 * read and would otherwise make every documentation page render per request.
 * Forcing static here removes the read, and the fallback it lands on is `en` —
 * which is the correct answer for this tree, since the documentation is English
 * only. Nothing under `/docs` depends on the request.
 *
 * The documentation is unlocalized but renders the shared header and footer,
 * whose controls are client components that need a locale, so this tree has a
 * provider of its own — like `[locale]/layout`, and for the reason given there:
 * one in the root layout outlives the page it was rendered for. Prop-less, it
 * inherits the same `en` the root layout resolves. `HtmlLang` writes that `en`
 * back into `<html lang>` for a reader who arrived here from `/fr`.
 */
export const dynamic = "force-static";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const groups = getDocsNav();

  return (
    <NextIntlClientProvider>
      <HtmlLang lang={site.lang("en")} />
      <div className="flex min-h-dvh flex-col">
        <SiteHeader localized={false} />

        <div className="mx-auto flex w-full max-w-7xl grow gap-10 px-4 sm:px-6 lg:px-8">
          <aside className="sticky top-[4.25rem] hidden h-[calc(100dvh-4.25rem)] w-56 shrink-0 overflow-y-auto py-10 lg:block">
            <DocsSidebar groups={groups} />
          </aside>

          <div className="min-w-0 grow">
            {/* No JavaScript for the mobile index: a disclosure element is the
              whole interaction, and it works before hydration. */}
            <details className="mt-6 rounded-lg border lg:hidden">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                Documentation
              </summary>
              <div className="border-t px-1 py-3">
                <DocsSidebar groups={groups} />
              </div>
            </details>

            <main id="main" className="py-10">
              {children}
            </main>
          </div>
        </div>

        <SiteFooter />
      </div>
    </NextIntlClientProvider>
  );
}
