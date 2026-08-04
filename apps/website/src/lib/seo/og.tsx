import { ImageResponse } from "next/og";

import { SITE } from "@/lib/constants";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * The card every page shares.
 *
 * Deliberately a terminal, not a screenshot: the terminal *is* the product, and
 * a preview promising a dashboard would be the first thing this site says and
 * also the first thing it got wrong. Built with the ambient font rather than a
 * fetched one — a preview image is not worth a network call in the build that
 * can fail it.
 */
export function ogImage({
  title,
  subtitle,
  label,
}: {
  title: string;
  subtitle?: string;
  label?: string;
}) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#12151a",
        padding: 72,
        color: "#e8eaed",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Hex rather than a token: `next/og` resolves no CSS variables. These are
            the sRGB fallbacks of the same Tailwind stops the site uses on a dark
            surface — emerald-400 here, amber-400 and red-400 below. */}
        <svg width="40" height="40" viewBox="0 0 24 24">
          <path d="M5.25 2.5v19" stroke="#e8eaed" strokeWidth="1.75" />
          <path d="M5.25 4h13l-2.6 4.25 2.6 4.25h-13z" fill="#00d492" />
        </svg>
        <span style={{ fontSize: 34, fontWeight: 600 }}>{SITE.name}</span>
        {label ? (
          <span
            style={{
              fontSize: 22,
              color: "#8b929c",
              border: "1px solid #2b3038",
              borderRadius: 8,
              padding: "4px 12px",
            }}
          >
            {label}
          </span>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div style={{ fontSize: 66, fontWeight: 600, lineHeight: 1.1, letterSpacing: -1.5 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 30, color: "#98a0ab", lineHeight: 1.4 }}>
            {subtitle.length > 160 ? `${subtitle.slice(0, 157)}…` : subtitle}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 24,
        }}
      >
        <span style={{ color: "#8b929c" }}>{SITE.domain}</span>
        {/* The three verdicts, in the order the CLI can print them. */}
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#00d492" }} />
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#ffb900" }} />
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#ff6467" }} />
        </div>
      </div>
    </div>,
    OG_SIZE,
  );
}
