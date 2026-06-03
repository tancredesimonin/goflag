import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const runLinkAuditMock = vi.fn();
const routerPushMock = vi.fn();

vi.mock("@/app/actions/audit", () => ({
  runLinkAudit: (...args: unknown[]) => runLinkAuditMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { LinksForm } from "./links-form";

describe("<LinksForm />", () => {
  beforeEach(() => {
    runLinkAuditMock.mockReset();
    routerPushMock.mockReset();
  });

  it("runs the link audit and navigates to /links", async () => {
    runLinkAuditMock.mockResolvedValueOnce({ ok: true, url: "https://example.com" });
    render(<LinksForm />);
    fireEvent.change(screen.getByTestId("links-input"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByTestId("links-submit"));
    await waitFor(() => {
      expect(runLinkAuditMock).toHaveBeenCalledWith({ url: "https://example.com" });
    });
    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/links?url=https%3A%2F%2Fexample.com");
    });
  });

  it("surfaces an error and does not navigate on failure", async () => {
    runLinkAuditMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "unexpected", message: "nope" },
    });
    render(<LinksForm />);
    fireEvent.change(screen.getByTestId("links-input"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByTestId("links-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("links-form-error").textContent).toContain("nope");
    });
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
