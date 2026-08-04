import { withContentCollections } from "@content-collections/next";
import createNextIntlPlugin from "next-intl/plugin";
import { withPlausibleProxy } from "next-plausible";

const rawFrontendUrl = process.env.NEXT_PUBLIC_WEBSITE_FRONTEND_URL?.trim() ?? "";
const requirePublicSiteUrl = process.env.APP_ENV === "production" || process.env.CI === "true";
const frontendUrl = rawFrontendUrl || (requirePublicSiteUrl ? "" : "http://localhost:3004");

if (!frontendUrl) {
  throw new Error(
    "NEXT_PUBLIC_WEBSITE_FRONTEND_URL must be set for a production or CI build (.env, or a Docker build arg).",
  );
}

const isProduction = process.env.APP_ENV === "production";

const withNextIntlConfig = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        // Every non-production deployment refuses indexing at the header level
        // as well as in robots.txt. goflag flags a robots.txt that contradicts
        // the pages it serves, so the two must agree — and `X-Robots-Tag` is
        // the one a crawler cannot miss.
        ...(isProduction ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
};

// next-plausible v4 tracks against Plausible's site-specific script URL rather
// than a domain, so the proxy is only wired up once that URL is known. Without
// it the site still builds and serves — it just does not measure anything.
const plausibleSrc = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC?.trim();

const withPlausible = plausibleSrc
  ? withPlausibleProxy({ src: plausibleSrc })(nextConfig)
  : nextConfig;

export default withContentCollections(withNextIntlConfig(withPlausible));
