/**
 * The shape of the switcher under the headline: what goflag prevents, then the
 * four checks.
 *
 * The first tab and the other four are deliberately different shapes. The
 * opening tab has to answer why anyone should care, so it is two timelines of
 * the same commit; its prose lives in `messages/*.json` under
 * `home.workflow.prevents`. The four check tabs are drawings of the checks
 * themselves — a matrix with a hole, two files that contradict each other —
 * and their content is literal in every locale (identifiers, rule ids,
 * printed output), so it lives in `check-flows.tsx` rather than here or in the
 * message catalogues. Only each tab's name and question are translated.
 */

export type StepIcon = "tag" | "ship" | "unseen" | "falling" | "flag" | "fix" | "clean";

/**
 * One beat on a timeline. Its strings — title, chip label and the elapsed
 * time that carries the whole argument — live under `…<trackId>.<stepId>`.
 */
export interface Step {
  id: string;
  icon: StepIcon;
}

export interface Track {
  id: string;
  /** `cost` is the timeline you are on today; `saved` is the one goflag puts you on. */
  tone: "cost" | "saved";
  /**
   * Both tracks run the same number of beats, and they have to: the comparison
   * is between two endings, not between a long story and a short one. Step three
   * of one is someone asking why traffic fell and step three of the other is the
   * page doing its job, in the same three moves.
   */
  steps: readonly [Step, Step, Step];
}

export type FlowIcon = "shield" | "link" | "languages" | "robots" | "tags";

export type CheckFlowId = "links" | "i18n" | "robots" | "metadata";

interface FlowBase {
  icon: FlowIcon;
}

export type Flow =
  | (FlowBase & {
      id: "prevents";
      kind: "fork";
      /** The one commit both tracks start from. Keyed as `…origin`. */
      origin: Step;
      tracks: readonly [Track, Track];
    })
  | (FlowBase & {
      id: CheckFlowId;
      kind: "check";
    });

export const FLOWS: readonly Flow[] = [
  /**
   * The same commit, on two timelines.
   *
   * Nothing in here names a flag, a format or a rule, because none of that is why
   * anyone would want this. The argument is made by the shape: three beats on each
   * track, aligned column for column, so the two endings sit side by side and the
   * only variable is whether anything read the page before it shipped.
   *
   * The second track deliberately does not stop at the alert. Being told a CI step
   * failed is a cost, not a benefit, and a diagram that ends there is selling the
   * interruption rather than the outcome. It ends where the reader actually wants
   * to be: the tag fixed, the page indexed, the shared link rendering its preview
   * — all of it still on day 0.
   */
  {
    id: "prevents",
    icon: "shield",
    kind: "fork",
    origin: { id: "origin", icon: "tag" },
    tracks: [
      {
        id: "without",
        tone: "cost",
        steps: [
          { id: "shipped", icon: "ship" },
          { id: "unnoticed", icon: "unseen" },
          { id: "tooLate", icon: "falling" },
        ],
      },
      {
        id: "with",
        tone: "saved",
        steps: [
          { id: "flagged", icon: "flag" },
          { id: "fixed", icon: "fix" },
          { id: "clean", icon: "clean" },
        ],
      },
    ],
  },
  { id: "links", icon: "link", kind: "check" },
  { id: "i18n", icon: "languages", kind: "check" },
  { id: "robots", icon: "robots", kind: "check" },
  { id: "metadata", icon: "tags", kind: "check" },
] as const;
