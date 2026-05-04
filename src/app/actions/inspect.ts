"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inspect, type InspectOptions } from "@/lib/core/inspect";
import { FetchError } from "@/lib/core/fetch/static";
import { HeadlessUnavailableError } from "@/lib/core/extract/headless";
import { setCachedPage } from "@/lib/store/inspect-cache";

export type InspectActionResult =
  | { ok: true; url: string }
  | { ok: false; error: { code: InspectErrorCode; message: string } };

export type InspectErrorCode =
  | "invalid-url"
  | "fetch-failed"
  | "headless-unavailable"
  | "unexpected";

const URL_PATTERN = /^https?:\/\//i;

interface RunInspectInput {
  url: string;
  mode?: InspectOptions["mode"];
  insecure?: boolean;
}

/**
 * Run the engine against `url` and stash the resulting `Page` in the
 * process-local cache. Used by the home page form, the "Re-fetch" button on
 * the inspect view, and (later) the watch-mode WebSocket bridge.
 *
 * On success the action redirects to /inspect?url=… so the client doesn't
 * have to thread the result back through router state. On failure it
 * returns a structured error the caller can surface in a toast or form
 * message — never throws across the action boundary.
 */
export async function runInspect(input: RunInspectInput): Promise<InspectActionResult> {
  const trimmed = input.url.trim();
  if (!trimmed || !URL_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: {
        code: "invalid-url",
        message: "Enter a full URL starting with http:// or https://",
      },
    };
  }

  try {
    const page = await inspect(trimmed, {
      mode: input.mode ?? "auto",
      allowInsecureTls: input.insecure === true,
      probes: true,
    });
    setCachedPage(trimmed, page);
    revalidatePath("/inspect");
    return { ok: true, url: trimmed };
  } catch (err) {
    if (err instanceof HeadlessUnavailableError) {
      return {
        ok: false,
        error: {
          code: "headless-unavailable",
          message: err.message,
        },
      };
    }
    if (err instanceof FetchError) {
      return {
        ok: false,
        error: { code: "fetch-failed", message: err.message },
      };
    }
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
 * Form-action variant for `<form action={inspectAndRedirect}>`. On success
 * redirects to /inspect; on failure throws so Next renders the segment's
 * error.tsx — the inline error path is handled by `runInspect` callers
 * (URL form on the home page) which want richer in-page feedback.
 */
export async function inspectAndRedirect(formData: FormData): Promise<void> {
  const url = String(formData.get("url") ?? "");
  const result = await runInspect({ url });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  redirect(`/inspect?url=${encodeURIComponent(result.url)}`);
}
