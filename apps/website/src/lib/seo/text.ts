/**
 * Trim to the 160-character window `description.length` reports on, at a word
 * boundary. Used where the text is generated from another source — a rule's own
 * prose — and cannot simply be rewritten shorter by hand.
 */
export function clampDescription(text: string, max = 160): string {
  if (text.length <= max) return text;

  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.]$/, "")}…`;
}
