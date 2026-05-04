import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const setThemeMock = vi.fn();
let resolved: string | undefined = "dark";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: resolved, setTheme: setThemeMock }),
}));

import { ThemeToggle } from "./theme-toggle";

describe("<ThemeToggle />", () => {
  it("toggles to light when currently dark", async () => {
    resolved = "dark";
    setThemeMock.mockReset();
    render(<ThemeToggle />);
    // useEffect mounts asynchronously — flush microtasks.
    await act(async () => {});
    fireEvent.click(screen.getByRole("button"));
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });

  it("toggles to dark when currently light", async () => {
    resolved = "light";
    setThemeMock.mockReset();
    render(<ThemeToggle />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button"));
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });
});
