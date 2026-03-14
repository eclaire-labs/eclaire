import { beforeEach, describe, expect, it, vi } from "vitest";
import { browseChromeTool } from "../../lib/agent/tools/browse-chrome.js";

const browserRuntimeMock = vi.hoisted(() => ({
  listTabs: vi.fn(),
  selectTab: vi.fn(),
  open: vi.fn(),
  navigate: vi.fn(),
  snapshot: vi.fn(),
  click: vi.fn(),
  fill: vi.fn(),
  pressKey: vi.fn(),
  screenshot: vi.fn(),
  closeTab: vi.fn(),
}));

vi.mock("../../lib/browser/index.js", () => ({
  browserRuntime: browserRuntimeMock,
}));

describe("browseChrome tool", () => {
  const context = {
    userId: "user_123",
    requestId: "req_123",
    sessionId: "session_123",
    extra: {
      callerAuthMethod: "session",
      callerActorKind: "human",
      conversationId: "conversation_123",
      backgroundTaskExecution: false,
    },
  };

  beforeEach(() => {
    Object.values(browserRuntimeMock).forEach((mockFn) => {
      mockFn.mockReset();
    });
  });

  it("lists tabs for human browser sessions", async () => {
    browserRuntimeMock.listTabs.mockResolvedValue([
      {
        id: "3",
        pageIdx: 3,
        title: "Dashboard",
        url: "https://app.example.com",
        selected: true,
      },
    ]);

    const result = await browseChromeTool.execute(
      "call_1",
      { action: "listTabs" },
      context,
    );

    expect(browserRuntimeMock.listTabs).toHaveBeenCalledWith({
      sessionId: "session_123",
      conversationId: "conversation_123",
      requestId: "req_123",
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "* 3: Dashboard (https://app.example.com)",
    });
  });

  it("blocks API-key initiated use", async () => {
    const result = await browseChromeTool.execute(
      "call_1",
      { action: "listTabs" },
      {
        ...context,
        extra: {
          ...context.extra,
          callerAuthMethod: "api_key",
        },
      },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "browseChrome is only available in human-authenticated browser sessions.",
    });
  });

  it("requires fill actions to include an element ref and value", async () => {
    const result = await browseChromeTool.execute(
      "call_1",
      { action: "fill", elementRef: "@e1" },
      context,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "browseChrome fill requires a value.",
    });
  });
});
