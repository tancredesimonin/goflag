import type { LinkAuditReport } from "@/lib/core/links/types";

/**
 * Process-scoped, in-memory store of link-audit reports keyed by origin.
 *
 * Sibling to `site-store.ts` and `inspect-cache.ts`: same local-first
 * rationale, same "this becomes the backend seam for the SaaS layer"
 * note. Keyed by origin (not full URL) because a link audit describes a
 * whole site, so any page on `https://example.com` resolves to the same
 * report.
 */

const MAX_ORIGINS = 20;

interface LinkAuditEntry {
  report: LinkAuditReport;
  storedAt: number;
}

const store = new Map<string, LinkAuditEntry>();

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function setLinkAudit(report: LinkAuditReport): void {
  const key = report.origin;
  if (store.size >= MAX_ORIGINS && !store.has(key)) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.delete(key);
  store.set(key, { report, storedAt: Date.now() });
}

/** Look up a report by any URL on the site (resolved to its origin). */
export function getLinkAudit(url: string): LinkAuditReport | undefined {
  const origin = originOf(url);
  if (!origin) return undefined;
  return store.get(origin)?.report;
}

/** All reports made this session, newest first. */
export function listLinkAudits(): LinkAuditReport[] {
  return Array.from(store.values())
    .sort((a, b) => b.storedAt - a.storedAt)
    .map((entry) => entry.report);
}

export function clearLinkAuditStore(): void {
  store.clear();
}
