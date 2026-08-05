import PlausibleProvider from "next-plausible";

import { isProduction } from "@/lib/seo/metadata";

/**
 * Plausible, or nothing at all.
 *
 * `PlausibleProvider` throws when it has neither a `src` nor the proxy
 * configured in `next.config.mjs` — and it throws even with `enabled={false}`,
 * so an unconfigured site cannot simply render it and pass a flag. Both are fed
 * by the same variable, which is why one check covers them.
 */
const configured = Boolean(process.env.NEXT_PUBLIC_PLAUSIBLE_SRC?.trim());

export function Analytics({ children }: { children: React.ReactNode }) {
  if (!configured) return <>{children}</>;

  return <PlausibleProvider enabled={isProduction()}>{children}</PlausibleProvider>;
}
