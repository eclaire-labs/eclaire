import { describe, expect, it, vi } from "vitest";
import { ChromeMcpSessionManager } from "../../lib/browser/chrome-mcp.js";

function createMockConnection() {
  return {
    callTool: vi.fn(),
    ensureConnected: vi.fn(),
    disconnect: vi.fn(),
    getState: vi.fn().mockReturnValue("disconnected"),
    getLastError: vi.fn().mockReturnValue(null),
    getServerKey: vi.fn().mockReturnValue("chrome-devtools"),
    getConfig: vi.fn().mockReturnValue({}),
    getDiscoveredTools: vi.fn().mockReturnValue([]),
    discoverTools: vi.fn().mockResolvedValue([]),
  } as any;
}

describe("ChromeMcpSessionManager", () => {
  it("parses structured list_pages results that use page ids", async () => {
    const conn = createMockConnection();
    conn.callTool.mockResolvedValue({
      structuredContent: {
        pages: [
          {
            id: 7,
            url: "https://example.com",
            selected: true,
          },
        ],
      },
    });
    const manager = new ChromeMcpSessionManager(conn);

    await expect(manager.listTabs()).resolves.toEqual([
      {
        id: "7",
        pageIdx: 7,
        title: "https://example.com",
        url: "https://example.com",
        selected: true,
      },
    ]);
  });

  it("parses text list_pages results from chrome-devtools-mcp", async () => {
    const conn = createMockConnection();
    conn.callTool.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "## Pages\n0: https://example.com [selected]\n1: https://mail.example.com isolatedContext=eclaire",
        },
      ],
    });
    const manager = new ChromeMcpSessionManager(conn);

    await expect(manager.listTabs()).resolves.toEqual([
      {
        id: "0",
        pageIdx: 0,
        title: "https://example.com",
        url: "https://example.com",
        selected: true,
      },
      {
        id: "1",
        pageIdx: 1,
        title: "https://mail.example.com",
        url: "https://mail.example.com",
        selected: false,
      },
    ]);
  });

  it("uses pageId when selecting a page", async () => {
    const conn = createMockConnection();
    conn.callTool.mockResolvedValue({
      content: [{ type: "text", text: "Selected page 4." }],
    });
    const manager = new ChromeMcpSessionManager(conn);

    await manager.selectTab(4);

    expect(conn.callTool).toHaveBeenCalledWith("select_page", { pageId: 4 });
  });

  it("uses pageId when closing a page", async () => {
    const conn = createMockConnection();
    conn.callTool.mockResolvedValue({
      content: [{ type: "text", text: "Closed page 4." }],
    });
    const manager = new ChromeMcpSessionManager(conn);

    await manager.closeTab(4);

    expect(conn.callTool).toHaveBeenCalledWith("close_page", { pageId: 4 });
  });
});
