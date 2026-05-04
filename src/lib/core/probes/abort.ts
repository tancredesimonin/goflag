/**
 * Compose an optional caller-driven `AbortSignal` with a timeout deadline into
 * a single signal that triggers when either fires. Returns the combined signal
 * plus a `cleanup` callback that the caller MUST run in `finally` to clear the
 * timer and detach the listener.
 *
 * Lifted out of the individual probes so the abort plumbing has one tested
 * implementation and one set of branches the coverage gate can reason about.
 */
export function combineSignals(
  caller: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (!caller) {
    return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
  }
  if (caller.aborted) {
    controller.abort();
    return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
  }
  const onAbort = () => controller.abort();
  caller.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      caller.removeEventListener("abort", onAbort);
    },
  };
}
