import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "./theme-provider";

describe("<ThemeProvider />", () => {
  it("renders its children inside the next-themes context", () => {
    render(
      <ThemeProvider>
        <span data-testid="child">hello</span>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("child")).toHaveTextContent("hello");
  });
});
