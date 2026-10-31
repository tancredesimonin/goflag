import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { OgFontFace } from "@goflag/og";

/**
 * The two OFL faces, read once at module load — so whoever imports this pays for
 * them, which is why it is a module of its own. The terminal images import it
 * statically, being fonts and nothing else; the share card only when it draws.
 *
 * Why they are committed at all is I7's second exception, and `terminal-image.tsx`.
 */
const FONT_DIR = join(process.cwd(), "src", "lib", "seo", "fonts");

export const MONO_FACES = [
  {
    name: "JetBrains Mono",
    data: readFileSync(join(FONT_DIR, "JetBrainsMono-Regular.ttf")),
    weight: 400,
  },
  {
    name: "JetBrains Mono",
    data: readFileSync(join(FONT_DIR, "JetBrainsMono-Bold.ttf")),
    weight: 700,
  },
] as const satisfies readonly OgFontFace[];
