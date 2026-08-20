import type { ReactNode } from "react";

import { Terminal } from "@/components/site/terminal";
import { SAMPLES } from "@/lib/transcripts";

/**
 * A generated transcript, in a terminal panel, inside a documentation page.
 *
 * Registered in the MDX map so a `.mdx` file can write
 * `<Terminal id="gate">…</Terminal>`. Before this existed no page under
 * `/docs` could show anything but a paragraph, a table, a fenced block or a
 * `Callout` — which is why the two pages whose subject *is* a picture contain
 * none, and why the section headed "The matrix" draws no matrix.
 *
 * ## The children are the point, and they are not rendered
 *
 * The panel is painted from `<id>.ansi`, which `packages/cli` generates and
 * compares to the renderers byte for byte. The fenced block written inside the
 * tag is never drawn — it exists so that `rawBody` still carries the transcript
 * when `/raw/docs/<slug>.md` hands this page to an agent. A self-closing tag
 * would render the same page and quietly empty that surface, on a project whose
 * own pitch is "hand it to an AI agent".
 *
 * Two copies would normally mean drift, which is the failure this whole change
 * exists to end. So `docs-transcripts.test.ts` asserts that the fence inside
 * every `<Terminal>` in `content/docs` is exactly `<id>.txt`. The copy cannot
 * rot; it can only fail the suite.
 */
export function TerminalTranscript({
  id,
}: {
  id: string;
  /**
   * The plain-text fence. Declared so a page author can see it belongs here,
   * and deliberately not destructured: it is consumed from `rawBody` by
   * `/raw`, never by this render. Binding it would be an unused variable
   * saying the opposite of what the prop is for.
   */
  children?: ReactNode;
}) {
  const sample = SAMPLES.find((entry) => entry.id === id);

  if (!sample) {
    // Loud rather than blank. The cause would be a transcript renamed three
    // packages away, and an empty panel in a doc page reads as a styling bug.
    throw new Error(
      `<Terminal id="${id}"> has no transcript. Known: ${SAMPLES.map((s) => s.id).join(", ")}. ` +
        `Add it to packages/cli/scripts/transcripts.ts and regenerate.`,
    );
  }

  return (
    <Terminal
      command={sample.command}
      lines={sample.lines}
      className="not-prose my-6"
      label={`goflag ${id}`}
    />
  );
}
