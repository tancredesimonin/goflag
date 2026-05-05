"use server";

import { resolve as resolvePath } from "node:path";
import { revalidatePath } from "next/cache";

import { inspect } from "@/lib/core/inspect";
import { lint } from "@/lib/core/lint";
import { applyFrameworkSnippets, applyRuleConfig, loadConfig } from "@/lib/config";
import { buildSnapshot, writeSnapshot } from "@/lib/snapshots";
import { setCachedPage } from "@/lib/store/inspect-cache";

export type AcceptSnapshotResult =
  | { ok: true; route: string; written: string }
  | { ok: false; message: string };

/**
 * Re-run the engine for `url`, build a fresh snapshot, and write it to
 * `<config.snapshot.dir>/<route-slug>.json`. Used by the in-UI Snapshot
 * tab's "Accept changes" button.
 *
 * Refusing to silently mint a snapshot saved a class of bugs in the
 * Phase 5 CLI: the engine output can shift between runs (Chromium
 * escalation, redirect handling), and the snapshot file becomes the
 * legal record of "what we expect this route to look like". So this
 * action always re-fetches before writing — it never trusts a cached
 * `Page` from a previous render.
 */
export async function acceptSnapshot(input: { url: string }): Promise<AcceptSnapshotResult> {
  const trimmed = input.url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    return { ok: false, message: "Enter a full URL starting with http:// or https://" };
  }
  try {
    const configResult = await loadConfig();
    const config = configResult.ok ? configResult.config : undefined;
    const page = await inspect(trimmed, { mode: "auto", probes: true });
    setCachedPage(trimmed, page);
    const issues = applyFrameworkSnippets(applyRuleConfig(lint(page), config), config?.framework);
    const snap = buildSnapshot(page, {
      issues,
      normalize: config?.normalize ?? [],
    });
    const dir = resolvePath(process.cwd(), config?.snapshot?.dir ?? ".headlint/snapshots");
    const written = await writeSnapshot(snap, dir);
    revalidatePath("/inspect");
    return { ok: true, route: snap.route, written };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
