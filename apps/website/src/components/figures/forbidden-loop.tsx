/**
 * The one direction the loop must never run: the library blinding the auditor.
 *
 * `next/routes.mdx` carries this as a paragraph with three numbers in it —
 * 1024×1024 artwork, a 337-byte 1×1 placeholder, both declared 1200×630, and a
 * ratio rule that read the declaration, refused to fetch, and passed them. It
 * is the most important safety argument in the library documentation and it is
 * one paragraph long.
 *
 * ## The first figure here that earns an SVG
 *
 * Four figures in, the rule that came out of the first two is: geometry that
 * has to **measure** belongs in SVG, geometry that only has to **connect**
 * belongs in the layout. This one measures. Drawing 1×1 and 1024×1024 to scale
 * inside the 1200×630 frame they both claimed is the argument — a single pixel
 * declared as a landscape card is absurd in a way no sentence makes it, and a
 * square overflowing a 1.9:1 box is visible before it is read.
 *
 * The numbers are the ones already published in that page, which is why nothing
 * here is pinned to code: they are a historical measurement of a defect that
 * has been fixed, not a claim about what the library does now.
 */

/** The frame both files were declared to fill. 1200 / 630 = 1.905, the "1.9". */
export const FRAME = { w: 1200, h: 630 };

/** The two real files, at their real sizes. */
export const ARTWORK = { side: 1024, label: "1024 × 1024 artwork" };
export const PLACEHOLDER = { side: 1, bytes: 337, label: "1 × 1 placeholder, 337 bytes" };

export function ForbiddenLoop() {
  // Centred in the declared frame, at true scale, so the overflow is measured
  // rather than drawn for effect.
  const artX = (FRAME.w - ARTWORK.side) / 2;
  const artY = (FRAME.h - ARTWORK.side) / 2;

  return (
    <figure className="not-prose border-border my-8 rounded-lg border p-4 sm:p-6">
      <figcaption className="text-muted-foreground mb-4 text-sm">
        Both files below were declared <code>1200×630</code> by the library, which had never looked
        at either. Drawn to scale inside the frame they claimed.
      </figcaption>

      <div className="overflow-x-auto">
        <svg
          viewBox={`-40 -240 ${FRAME.w + 80} ${FRAME.h + 640}`}
          className="w-full min-w-[20rem]"
          role="img"
          aria-label={
            `A 1200 by 630 frame. A 1024 by 1024 square drawn to scale overflows it above and ` +
            `below. A 1 by 1 pixel, also to scale, is a dot too small to see. Both were declared ` +
            `1200 by 630.`
          }
        >
          {/* The 1024 square, true scale: it cannot fit a 630-high box. */}
          <rect
            x={artX}
            y={artY}
            width={ARTWORK.side}
            height={ARTWORK.side}
            className="fill-flag-yellow/10 stroke-flag-yellow/70"
            strokeWidth={4}
            strokeDasharray="12 10"
          />
          <text
            x={FRAME.w / 2}
            // Inside the square's top edge rather than above it: at true scale the
            // square starts above the frame, and a label placed outside it runs
            // off the top of the viewBox.
            y={artY + 52}
            textAnchor="middle"
            className="fill-flag-yellow font-mono"
            fontSize={38}
          >
            {ARTWORK.label}
          </text>

          {/* The declared frame. */}
          <rect
            x={0}
            y={0}
            width={FRAME.w}
            height={FRAME.h}
            className="fill-none stroke-flag-green/80"
            strokeWidth={5}
          />
          <text x={10} y={-14} className="fill-flag-green font-mono" fontSize={38}>
            declared 1200 × 630
          </text>

          {/* The placeholder, at true scale. One unit wide. */}
          <rect
            x={FRAME.w / 2}
            y={FRAME.h / 2}
            width={PLACEHOLDER.side}
            height={PLACEHOLDER.side}
            className="fill-flag-red stroke-flag-red"
            strokeWidth={1}
          />
          {/* The leader drops straight below the frame and the label is centred
              under it: anything anchored beside the dot runs out of the
              viewBox on a narrow screen, and an SVG does not wrap text. */}
          <line
            x1={FRAME.w / 2}
            y1={FRAME.h / 2}
            x2={FRAME.w / 2}
            y2={ARTWORK.side + artY + 60}
            className="stroke-flag-red"
            strokeWidth={3}
          />
          <text
            x={FRAME.w / 2}
            y={ARTWORK.side + artY + 108}
            textAnchor="middle"
            className="fill-flag-red font-mono"
            fontSize={38}
          >
            {PLACEHOLDER.label}
          </text>
          <text
            x={FRAME.w / 2}
            y={ARTWORK.side + artY + 152}
            textAnchor="middle"
            className="fill-flag-red/70 font-mono"
            fontSize={30}
          >
            actual size — the line ends on it
          </text>
        </svg>
      </div>

      <div className="mt-5 flex flex-col gap-2 text-sm">
        <p className="border-border text-muted-foreground rounded border-l-2 py-2 pr-3 pl-4">
          <span className="text-foreground font-medium">The loop.</span> The library declared a size
          it had not measured → <code>og.image.ratio</code> read that declaration, computed 1.9, and{" "}
          <strong className="text-foreground">refused to fetch the file</strong> → both images
          passed.
        </p>
        <p className="border-flag-red/60 bg-flag-red/5 text-muted-foreground rounded border-l-2 py-2 pr-3 pl-4">
          <span className="text-foreground font-medium">The rule that came out of it.</span> The
          auditor never reads a declaration produced by the library it audits. A bare path now
          declares a URL and nothing else, so <code>og.image.dimensions</code> asks you to measure —
          an honest verdict, and a better one than a confident lie.
        </p>
      </div>
    </figure>
  );
}
