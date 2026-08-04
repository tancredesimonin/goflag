import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Rendered rather than committed, so the mark has exactly one definition. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#12151a",
      }}
    >
      <svg width="120" height="120" viewBox="0 0 24 24">
        <path d="M5.25 2.5v19" stroke="#e8eaed" strokeWidth="1.75" strokeLinecap="square" />
        <path d="M5.25 4h13l-2.6 4.25 2.6 4.25h-13z" fill="#00d492" />
      </svg>
    </div>,
    size,
  );
}
