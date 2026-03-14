// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChromeBrowserControlCard from "@/components/settings/ChromeBrowserControlCard";

const browserApiMock = vi.hoisted(() => ({
  getBrowserStatus: vi.fn(),
  attachBrowser: vi.fn(),
  detachBrowser: vi.fn(),
}));

vi.mock("@/lib/api-browser", () => browserApiMock);
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ChromeBrowserControlCard", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    browserApiMock.getBrowserStatus.mockReset();
    browserApiMock.attachBrowser.mockReset();
    browserApiMock.detachBrowser.mockReset();
  });

  it("renders browser status details", async () => {
    browserApiMock.getBrowserStatus.mockResolvedValue({
      enabled: true,
      available: true,
      state: "connected",
      profile: {
        name: "user",
        label: "My Chrome Session",
        driver: "existing-session",
        transport: "chrome-mcp",
        attachOnly: true,
      },
      transport: "chrome-mcp",
      capabilities: {
        interactive: true,
        authenticatedSession: true,
        localOnly: true,
        screenshot: true,
        tabSelection: true,
      },
      tabCount: 3,
      activeTab: {
        id: "2",
        pageIdx: 2,
        title: "Inbox",
        url: "https://mail.example.com",
        selected: true,
      },
      lastError: null,
    });

    render(<ChromeBrowserControlCard />);

    await waitFor(() => {
      expect(screen.getByText("connected")).toBeInTheDocument();
    });

    expect(screen.getByText("3 tabs")).toBeInTheDocument();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeEnabled();
  });

  it("detaches the browser session", async () => {
    browserApiMock.getBrowserStatus.mockResolvedValue({
      enabled: true,
      available: true,
      state: "connected",
      profile: {
        name: "user",
        label: "My Chrome Session",
        driver: "existing-session",
        transport: "chrome-mcp",
        attachOnly: true,
      },
      transport: "chrome-mcp",
      capabilities: {
        interactive: true,
        authenticatedSession: true,
        localOnly: true,
        screenshot: true,
        tabSelection: true,
      },
      tabCount: 1,
      activeTab: null,
      lastError: null,
    });
    browserApiMock.detachBrowser.mockResolvedValue({
      enabled: true,
      available: true,
      state: "disconnected",
      profile: {
        name: "user",
        label: "My Chrome Session",
        driver: "existing-session",
        transport: "chrome-mcp",
        attachOnly: true,
      },
      transport: "chrome-mcp",
      capabilities: {
        interactive: true,
        authenticatedSession: true,
        localOnly: true,
        screenshot: true,
        tabSelection: true,
      },
      tabCount: 0,
      activeTab: null,
      lastError: null,
    });

    render(<ChromeBrowserControlCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Detach" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Detach" }));

    await waitFor(() => {
      expect(browserApiMock.detachBrowser).toHaveBeenCalledTimes(1);
      expect(screen.getByText("disconnected")).toBeInTheDocument();
    });
  });
});
