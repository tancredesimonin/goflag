"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { discoverSitemap } from "@/lib/core/sitemap/discover";
import { normalizeInputUrl } from "@/lib/core/net/normalize-url";
import { setSite } from "@/lib/store/site-store";

export type LoadSiteResult =
  | { ok: true; url: string; urlCount: number }
  | { ok: false; error: { code: LoadSiteErrorCode; message: string } };

export type LoadSiteErrorCode = "invalid-url" | "unexpected";

interface LoadSiteInput {
  url: string;
  insecure?: boolean;
}

/**
 * Discover the sitemap for the site `url` belongs to and stash the
 * resulting `SiteDiscovery` in the per-origin store. Used by the home
 * page's "Explore site" entry and the /site route.
 *
 * Mirrors `runInspect`: validates input, never throws across the action
 * boundary, and returns a structured result the caller can surface.
 */
export async function loadSite(input: LoadSiteInput): Promise<LoadSiteResult> {
  const normalized = normalizeInputUrl(input.url);
  if (!normalized.ok) {
    return {
      ok: false,
      error: {
        code: "invalid-url",
        message: "Enter a valid URL, e.g. example.com or https://example.com",
      },
    };
  }
  const url = normalized.url;

  try {
    const discovery = await discoverSitemap(url, { allowInsecureTls: input.insecure === true });
    setSite(discovery);
    revalidatePath("/site");
    return { ok: true, url, urlCount: discovery.urls.length };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "unexpected",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Form-action variant for progressive-enhancement submits. Redirects to
 * /site on success; throws on failure so the segment's error boundary
 * renders.
 */
export async function loadSiteAndRedirect(formData: FormData): Promise<void> {
  const url = String(formData.get("url") ?? "");
  const result = await loadSite({ url });
  if (!result.ok) throw new Error(result.error.message);
  redirect(`/site?url=${encodeURIComponent(result.url)}`);
}
