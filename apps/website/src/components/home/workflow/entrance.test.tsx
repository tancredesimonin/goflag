import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { CheckFlow } from "@/components/home/workflow/check-flows";
import { PreventsFlow } from "@/components/home/workflow/prevents-flow";
import { WorkflowTabs } from "@/components/home/workflow/workflow-tabs";
import { FLOWS } from "@/lib/workflow";

import messages from "../../../../messages/en.json";

/**
 * The hero diagram has to be drawn in the HTML the server sends, not by the
 * script that follows it.
 *
 * It was `motion`, which server-renders each node's first frame inline —
 * `style="opacity:0;transform:translateY(8px)"`, `scaleX(0)` on the rules — and
 * clears it from the client. A reader who prefers reduced motion got no
 * animation from the client, React kept the server's `style` on hydration, and
 * the diagram stayed blank. Nothing failed: the build passed, the page answered
 * 200, and every test was green.
 *
 * So this renders the components the way the server does, and reads the markup.
 * Not the prerendered page — `/[locale]` renders on demand, and `next build` is
 * not something `test:unit` runs — but the same React render of the same tree,
 * which is where an inline start frame comes from. A check that no file imports
 * `motion` would have been cheaper and narrower: it names one library, and the
 * same blank diagram is one hand-written `style={{ opacity: 0 }}` away.
 */

function render(node: ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

/**
 * Radix's, on the tabs around the diagram: the list's roving focus sets
 * `outline:none`, and `Presence` skips the open panel's mount animation with a
 * zero duration. Neither hides anything. Exact strings, so a Radix upgrade that
 * starts writing something else is read before it is allowed.
 */
const RADIX = new Set(["outline:none", "animation-duration:0s"]);

/** Every inline declaration in the markup, as `property:value`. */
function inlineDeclarations(html: string): string[] {
  return [...html.matchAll(/\sstyle="([^"]*)"/g)].flatMap((match) =>
    match[1]!.split(";").filter(Boolean),
  );
}

/** What the server sends: the hero's tabs, first panel open. */
const HERO = render(<WorkflowTabs label="One gate, four checks" />);

/** Every panel, including the four a click mounts on the client. */
const PANELS = FLOWS.map((flow) => ({
  id: flow.id,
  html: render(
    flow.kind === "fork" ? (
      <PreventsFlow origin={flow.origin} tracks={flow.tracks} />
    ) : (
      <CheckFlow id={flow.id} />
    ),
  ),
}));

describe("the hero diagram's server render", () => {
  it("draws the first panel's cards", () => {
    // Guards everything below: a render that came back empty, or a panel that
    // stopped mounting on the server, would have no inline style to object to.
    const prevents = FLOWS.find((flow) => flow.kind === "fork")!;
    const cards = 1 + prevents.tracks.reduce((sum, track) => sum + track.steps.length, 0);
    expect(FLOWS[0]).toBe(prevents);
    expect(HERO.match(/<h3\b/g)).toHaveLength(cards);
    expect(inlineDeclarations(HERO).length).toBeGreaterThan(0);
  });

  it("carries no inline style but a stagger", () => {
    // `beat()` writes `animation-delay` and nothing else. Any other inline
    // declaration on a node of this diagram is a frame of an animation that
    // only a script can finish — opacity, a transform, visibility, a clip.
    for (const { id, html } of [{ id: "hero", html: HERO }, ...PANELS]) {
      const frames = inlineDeclarations(html).filter(
        (d) => !d.startsWith("animation-delay:") && !RADIX.has(d),
      );
      expect(frames, id).toEqual([]);
    }
  });

  it("starts no SVG stroke undrawn or transparent", () => {
    // The same start frame, spelled as attributes. The arrows were a `motion.g`
    // starting at `{ pathLength: 0, opacity: 0 }`, which server-renders as
    // `opacity="0"` and `stroke-dasharray="0 1"` — no `style` at all.
    for (const { id, html } of [{ id: "hero", html: HERO }, ...PANELS]) {
      expect(html, id).not.toMatch(/\s(?:fill-|stroke-)?opacity="0(?:\.0*)?"/);
      expect(html, id).not.toMatch(/\sstroke-dasharray="0(?:px)?[\s,"]/);
    }
  });
});

/**
 * The other half of the arrangement: the starting frame lives in `@keyframes`,
 * and those run only under `prefers-reduced-motion: no-preference`. A
 * `.workflow-*` rule outside that block either animates for a reader who asked
 * for less motion, or — `opacity: 0` waiting for a class a script adds — hides
 * the diagram from them again.
 */
describe("the diagram's entrance in globals.css", () => {
  const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

  /** `[start, end)` of every block whose prelude matches. */
  function blocks(prelude: RegExp): Array<[number, number]> {
    return [...css.matchAll(prelude)].map((match) => {
      let depth = 0;
      for (let i = match.index! + match[0].length - 1; i < css.length; i++) {
        if (css[i] === "{") depth++;
        if (css[i] === "}" && --depth === 0) return [match.index!, i + 1];
      }
      throw new Error(`Unbalanced braces after ${match[0]}`);
    });
  }

  const motionOnly = blocks(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{/g);
  const used = new Set(
    [HERO, ...PANELS.map((panel) => panel.html)].flatMap((html) =>
      [...html.matchAll(/\sclass="([^"]*)"/g)].flatMap((match) =>
        match[1]!.split(/\s+/).filter((name) => name.startsWith("workflow-")),
      ),
    ),
  );

  it("finds the classes the diagram uses", () => {
    expect([...used].sort()).toEqual([
      "workflow-draw",
      "workflow-enter",
      "workflow-grow-x",
      "workflow-grow-y",
    ]);
  });

  it("styles them only for a reader who has not asked for less motion", () => {
    for (const name of used) {
      const rules = [...css.matchAll(new RegExp(`\\.${name}(?![\\w-])`, "g"))].map((m) => m.index!);
      expect(rules.length, name).toBeGreaterThan(0);
      const outside = rules.filter(
        (at) => !motionOnly.some(([start, end]) => at > start && at < end),
      );
      expect(outside, name).toEqual([]);
    }
  });
});
