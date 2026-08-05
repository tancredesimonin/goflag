import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import { Analytics } from "@/components/providers/analytics";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { localeToBcp47 } from "@/i18n/config";
import { SITE } from "@/lib/constants";
import { getBaseUrl, rootRobots } from "@/lib/seo/metadata";

import "./globals.css";

/**
 * The three families the theme names: Inter for headings and UI, Source Serif 4
 * for body prose, JetBrains Mono for anything that quotes a terminal.
 *
 * All three are loaded as variable fonts — no `weight` list — so each is one
 * file covering every weight instead of nine static instances. Subsets stop at
 * `latin-ext`, which covers the four locales the site serves; Cyrillic, Greek and
 * Vietnamese would be bytes nobody here reads.
 */
const sans = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  variable: "--font-source-serif-4",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: { default: SITE.name, template: `%s — ${SITE.name}` },
  description: SITE.tagline,
  robots: rootRobots(),
  other: {
    /**
     * Dark Reader honours this and stands down on the whole site.
     *
     * The site already ships a dark theme, so the extension is not filling a
     * gap — it is re-inverting one that is already dark. What that costs here is
     * specific: the terminal panels are deliberately dark in both themes, and
     * the green / yellow / red in them are verdicts rather than decoration. An
     * automatic inversion shifts those hues, which turns the one part of the
     * page that has to be read literally into an approximation of itself.
     *
     * The extension only looks for the tag's name, but the value cannot be an
     * empty string: Next drops those from `other` and the tag never ships.
     */
    "darkreader-lock": "true",
  },
};

/**
 * A single root layout for both the localized site and the unlocalized
 * documentation.
 *
 * `getLocale()` resolves the locale segment on `/[locale]/…` and falls back to
 * `en` on `/docs/…`, which is the right answer there rather than a default
 * standing in for a missing one — the documentation really is English.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html
      lang={localeToBcp47(locale)}
      suppressHydrationWarning
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <Analytics>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            {/* The provider sits above both trees, not inside `[locale]`: the
                documentation is unlocalized but still renders the shared header,
                whose controls are client components that need a locale. */}
            <NextIntlClientProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </NextIntlClientProvider>
          </ThemeProvider>
        </Analytics>
      </body>
    </html>
  );
}
