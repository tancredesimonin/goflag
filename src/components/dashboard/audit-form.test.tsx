import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const runFullAuditMock = vi.fn();
const routerPushMock = vi.fn();

vi.mock("@/app/actions/audit", () => ({
  runFullAudit: (...args: unknown[]) => runFullAuditMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AuditForm } from "./audit-form";

describe("<AuditForm />", () => {
  beforeEach(() => {
    runFullAuditMock.mockReset();
    routerPushMock.mockReset();
  });

  it("runs the full audit and navigates to the dashboard", async () => {
    runFullAuditMock.mockResolvedValueOnce({ ok: true, url: "https://example.com" });
    render(<AuditForm />);
    fireEvent.change(screen.getByTestId("audit-input"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByTestId("audit-submit"));
    await waitFor(() => {
      expect(runFullAuditMock).toHaveBeenCalledWith({ url: "https://example.com", links: true });
    });
    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/dashboard?url=https%3A%2F%2Fexample.com");
    });
  });

  it("passes links:false when the toggle is unchecked", async () => {
    runFullAuditMock.mockResolvedValueOnce({ ok: true, url: "https://example.com" });
    render(<AuditForm />);
    fireEvent.click(screen.getByTestId("audit-links-toggle"));
    fireEvent.change(screen.getByTestId("audit-input"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByTestId("audit-submit"));
    await waitFor(() => {
      expect(runFullAuditMock).toHaveBeenCalledWith({ url: "https://example.com", links: false });
    });
  });

  it("shows an inline error on failure", async () => {
    runFullAuditMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "unexpected", message: "boom" },
    });
    render(<AuditForm />);
    fireEvent.change(screen.getByTestId("audit-input"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByTestId("audit-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("audit-form-error").textContent).toContain("boom");
    });
  });

  it("validates an empty URL without calling the action", () => {
    render(<AuditForm />);
    fireEvent.click(screen.getByTestId("audit-submit"));
    expect(runFullAuditMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("audit-form-error")).toBeInTheDocument();
  });
});
