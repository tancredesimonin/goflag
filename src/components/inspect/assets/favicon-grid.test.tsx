import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FaviconGrid } from "./favicon-grid";

describe("<FaviconGrid />", () => {
  it("renders an empty-state card when no icons are declared", () => {
    render(<FaviconGrid icons={[]} />);
    expect(screen.queryByTestId("favicon-grid")).toBeNull();
    expect(screen.getByText(/No favicons declared/i)).toBeInTheDocument();
  });

  it("renders one tile per icon with declared size and rel", () => {
    render(
      <FaviconGrid
        icons={[
          {
            rel: "icon",
            href: "/favicon-32.png",
            sizes: "32x32",
            parsedSizes: [{ width: 32, height: 32 }],
          },
          {
            rel: "apple-touch-icon",
            href: "/apple-touch-icon.png",
            sizes: "180x180",
            parsedSizes: [{ width: 180, height: 180 }],
          },
          {
            rel: "icon",
            href: "/favicon.svg",
            sizes: "any",
            parsedSizes: ["any"],
          },
        ]}
      />,
    );
    const sizes = screen.getAllByTestId("favicon-size").map((el) => el.textContent);
    expect(sizes).toEqual(["32×32", "180×180", "any"]);
  });

  it("falls back to a placeholder icon when the image fails to load", () => {
    render(
      <FaviconGrid
        icons={[
          {
            rel: "icon",
            href: "/broken.png",
            parsedSizes: [],
          },
        ]}
      />,
    );
    const img = screen.getByTestId("favicon-img");
    fireEvent.error(img);
    expect(screen.queryByTestId("favicon-img")).toBeNull();
  });

  it("uses the literal sizes attribute when no parsed sizes were extracted", () => {
    render(
      <FaviconGrid icons={[{ rel: "icon", href: "/x.png", sizes: "garbage", parsedSizes: [] }]} />,
    );
    expect(screen.getByTestId("favicon-size")).toHaveTextContent("garbage");
  });
});
