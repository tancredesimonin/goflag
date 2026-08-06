import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/seo/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    title: "CLI reference",
    subtitle: "Every flag, its default, and what it changes.",
    label: "docs",
  });
}
