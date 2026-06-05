"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { discoverSitemap } from "@/lib/core/sitemap/discover";
import { normalizeInputUrl } from "@/lib/core/net/normalize-url";
import { runLinkAudit as runLinkAuditEngine } from "@/lib/core/links/audit";
import type { LinkAuditOptions } from "@/lib/core/links/audit";
import type { LinkVerdict } from "@/lib/core/links/types";
import { getSite, setSite } from "@/lib/store/site-store";
import { setLinkAudit, getLinkAudit } from "@/lib/store/link-audit-store";

export type AuditErrorCode = "invalid-url" | "unexpected";

export type RunLinkAuditResult =
  | { ok: true; url: string; summary: Record<LinkVerdict, number>; pagesScanned: number }
  | { ok: false; error: { code: AuditErrorCode; message: string } };

export type RunFullAuditResult =
  | { ok: true; url: string; urlCount: number; ranLinks: boolean }
  | { ok: false; error: { code: AuditErrorCode; message: string } };

interface AuditInput {
  url: string;
  insecure?: boolean;
  includeAssets?: boolean;
  checkExternal?: boolean;
}

interface FullAuditInput extends AuditInput {
  /** Run the link audit as part of the full audit. Defaults to true. */
  links?: boolean;
}

function invalidUrl(): { ok: false; error: { code: AuditErrorCode; message: string } } {
  return {
    ok: false,
    error: {
      code: "invalid-url",
      message: "Enter a valid URL, e.g. example.com or https://example.com",
    },
  };
}

function unexpected(err: unknown): { ok: false; error: { code: AuditErrorCode; message: string } } {
  return {
    ok: false,
    error: { code: "unexpected", message: err instanceof Error ? err.message : String(err) },
  };
}

/**
 * Resolve the site's page list (reusing the per-origin store so we honour
 * "enter the base URL once"), then run the link audit and cache the
 * report. Mirrors `loadSite` / `runInspect`: validate, never throw across
 * the boundary, return a structured result.
 */
export async function runLinkAudit(input: AuditInput): Promise<RunLinkAuditResult> {
  const normalized = normalizeInputUrl(input.url);
  if (!normalized.ok) return invalidUrl();
  const url = normalized.url;

  try {
    const discovery =
      getSite(url) ?? (await discoverSitemap(url, { allowInsecureTls: input.insecure === true }));
    setSite(discovery);

    const options: LinkAuditOptions = {
      allowInsecureTls: input.insecure === true,
      includeAssets: input.includeAssets === true,
      checkExternal: input.checkExternal !== false,
    };
    const report = await runLinkAuditEngine(discovery, options);
    setLinkAudit(report);

    revalidatePath("/links");
    return { ok: true, url, summary: report.summary, pagesScanned: report.pagesScanned };
  } catch (err) {
    return unexpected(err);
  }
}

/**
 * Single entry for the unified home flow: run the shared discovery once,
 * then (by default) kick off the link audit so the dashboard can show
 * sitemap + link results from one submit. The head audit stays lazy
 * (inspected on navigation) to avoid headless cost.
 */
export async function runFullAudit(input: FullAuditInput): Promise<RunFullAuditResult> {
  const normalized = normalizeInputUrl(input.url);
  if (!normalized.ok) return invalidUrl();
  const url = normalized.url;

  try {
    const discovery = await discoverSitemap(url, {
      allowInsecureTls: input.insecure === true,
    });
    setSite(discovery);

    let ranLinks = false;
    if (input.links !== false) {
      const report = await runLinkAuditEngine(discovery, {
        allowInsecureTls: input.insecure === true,
        includeAssets: input.includeAssets === true,
        checkExternal: input.checkExternal !== false,
      });
      setLinkAudit(report);
      ranLinks = true;
    }

    revalidatePath("/");
    revalidatePath("/site");
    revalidatePath("/links");
    return { ok: true, url, urlCount: discovery.urls.length, ranLinks };
  } catch (err) {
    return unexpected(err);
  }
}

/**
 * Form-action variant for progressive-enhancement submits from the home
 * page. Runs the full audit, then redirects to the dashboard.
 */
export async function runFullAuditAndRedirect(formData: FormData): Promise<void> {
  const url = String(formData.get("url") ?? "");
  const result = await runFullAudit({ url });
  if (!result.ok) throw new Error(result.error.message);
  redirect(`/dashboard?url=${encodeURIComponent(result.url)}`);
}

/** Whether a cached link-audit report already exists for `url`'s origin. */
export async function hasLinkAudit(url: string): Promise<boolean> {
  return getLinkAudit(url) !== undefined;
}
