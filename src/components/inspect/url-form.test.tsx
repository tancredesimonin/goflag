import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const runInspectMock = vi.fn();
const routerPushMock = vi.fn();

vi.mock("@/app/actions/inspect", () => ({
  runInspect: (...args: unknown[]) => runInspectMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { UrlForm } from "./url-form";

describe("<UrlForm />", () => {
  beforeEach(() => {
    runInspectMock.mockReset();
    routerPushMock.mockReset();
  });

  it("submits the URL through the Server Action and navigates on success", async () => {
    runInspectMock.mockResolvedValueOnce({ ok: true, url: "https://example.com" });
    render(<UrlForm />);
    fireEvent.change(screen.getByTestId("url-input"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByTestId("inspect-submit"));
    await waitFor(() => {
      expect(runInspectMock).toHaveBeenCalledWith({ url: "https://example.com" });
    });
    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/inspect?url=https%3A%2F%2Fexample.com");
    });
  });

  it("shows the structured error message when the action fails", async () => {
    runInspectMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "fetch-failed", message: "DNS lookup failed for nope.local" },
    });
    render(<UrlForm />);
    fireEvent.change(screen.getByTestId("url-input"), {
      target: { value: "https://nope.local" },
    });
    fireEvent.submit(screen.getByTestId("url-input").closest("form")!);
    await waitFor(() => {
      expect(screen.getByTestId("url-form-error")).toHaveTextContent(
        "DNS lookup failed for nope.local",
      );
    });
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it("rejects an empty submission inline without calling the action", () => {
    render(<UrlForm />);
    fireEvent.click(screen.getByTestId("inspect-submit"));
    expect(screen.getByTestId("url-form-error")).toHaveTextContent("Enter a URL to inspect.");
    expect(runInspectMock).not.toHaveBeenCalled();
  });

  it("invokes the onInspected callback instead of routing when provided", async () => {
    runInspectMock.mockResolvedValueOnce({ ok: true, url: "https://example.com" });
    const onInspected = vi.fn();
    render(<UrlForm defaultValue="https://example.com" onInspected={onInspected} />);
    fireEvent.click(screen.getByTestId("inspect-submit"));
    await waitFor(() => expect(onInspected).toHaveBeenCalledWith("https://example.com"));
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
