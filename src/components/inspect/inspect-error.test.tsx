import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}));

vi.mock("@/app/actions/inspect", () => ({
  runInspect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { InspectError } from "./inspect-error";

describe("<InspectError />", () => {
  it("fires a toast and renders a retry form", () => {
    toastErrorMock.mockReset();
    render(<InspectError url="https://nope.local" message="Network unreachable" />);
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to inspect https://nope.local",
      expect.objectContaining({ description: "Network unreachable" }),
    );
    expect(screen.getByTestId("inspect-error-message")).toHaveTextContent("Network unreachable");
    expect(screen.getByTestId("url-input")).toHaveValue("https://nope.local");
  });
});
