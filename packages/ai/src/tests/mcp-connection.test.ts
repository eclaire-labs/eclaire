import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServerConfig } from "../mcp/types.js";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before the module under test is imported
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  clientConnect: vi.fn(),
  clientClose: vi.fn(),
  clientListTools: vi.fn(),
  clientCallTool: vi.fn(),
  stderrResume: vi.fn(),
  stdioClose: vi.fn(),
  sseClose: vi.fn(),
  httpClose: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
  return {
    Client: class MockClient {
      connect = mocks.clientConnect;
      close = mocks.clientClose;
      listTools = mocks.clientListTools;
      callTool = mocks.clientCallTool;
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => {
  return {
    StdioClientTransport: class StdioClientTransport {
      constructor(public opts: unknown) {}
      stderr = { resume: mocks.stderrResume };
      close = mocks.stdioClose;
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => {
  return {
    SSEClientTransport: class SSEClientTransport {
      constructor(public url: URL) {}
      close = mocks.sseClose;
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => {
  return {
    StreamableHTTPClientTransport: class StreamableHTTPClientTransport {
      constructor(public url: URL) {}
      close = mocks.httpClose;
    },
  };
});

// Import after mocks are set up
import { McpServerConnection } from "../mcp/connection.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    name: "Test Server",
    transport: "stdio",
    command: "/usr/bin/test-mcp",
    args: ["--flag"],
    connectTimeout: 500,
    toolTimeout: 500,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("McpServerConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientConnect.mockResolvedValue(undefined);
  });

  // =========================================================================
  // Transport creation
  // =========================================================================

  describe("createTransport (via ensureConnected)", () => {
    it("creates stdio transport with command and args", async () => {
      const conn = new McpServerConnection("test", makeConfig());
      await conn.ensureConnected();
      expect(conn.getState()).toBe("connected");
    });

    it("throws when stdio transport has no command", async () => {
      const conn = new McpServerConnection(
        "test",
        makeConfig({ command: undefined }),
      );
      await expect(conn.ensureConnected()).rejects.toThrow(
        "no command is configured",
      );
    });

    it("creates SSE transport with URL", async () => {
      const conn = new McpServerConnection(
        "test",
        makeConfig({ transport: "sse", url: "http://localhost:3001/sse" }),
      );
      await conn.ensureConnected();
      expect(conn.getState()).toBe("connected");
    });

    it("throws when SSE transport has no URL", async () => {
      const conn = new McpServerConnection(
        "test",
        makeConfig({ transport: "sse", command: undefined }),
      );
      await expect(conn.ensureConnected()).rejects.toThrow(
        "no url is configured",
      );
    });

    it("creates streamable-http transport", async () => {
      const conn = new McpServerConnection(
        "test",
        makeConfig({
          transport: "streamable-http",
          url: "http://localhost:3001/mcp",
        }),
      );
      await conn.ensureConnected();
      expect(conn.getState()).toBe("connected");
    });

    it('handles "http" alias for streamable-http transport', async () => {
      const conn = new McpServerConnection(
        "test",
        makeConfig({ transport: "http", url: "http://localhost:3001/mcp" }),
      );
      await conn.ensureConnected();
      expect(conn.getState()).toBe("connected");
    });

    it("throws for unsupported transport", async () => {
      const conn = new McpServerConnection(
        "test",
        makeConfig({ transport: "unknown" as any }),
      );
      await expect(conn.ensureConnected()).rejects.toThrow(
        "unsupported transport",
      );
    });
  });

  // =========================================================================
  // Connection lifecycle
  // =========================================================================

  describe("ensureConnected", () => {
    it("connects successfully and sets state to connected", async () => {
      const conn = new McpServerConnection("test", makeConfig());
      expect(conn.getState()).toBe("disconnected");
      await conn.ensureConnected();
      expect(conn.getState()).toBe("connected");
      expect(conn.getLastError()).toBeNull();
    });

    it("only connects once on multiple calls", async () => {
      const conn = new McpServerConnection("test", makeConfig());
      await conn.ensureConnected();
      await conn.ensureConnected();
      expect(mocks.clientConnect).toHaveBeenCalledTimes(1);
    });

    it("sets state to error on connection failure", async () => {
      mocks.clientConnect.mockRejectedValueOnce(new Error("refused"));
      const conn = new McpServerConnection("test", makeConfig());
      await expect(conn.ensureConnected()).rejects.toThrow("refused");
      expect(conn.getState()).toBe("error");
      expect(conn.getLastError()).toBe("refused");
    });

    it("times out when connect takes too long", async () => {
      mocks.clientConnect.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );
      const conn = new McpServerConnection(
        "test",
        makeConfig({ connectTimeout: 50 }),
      );
      await expect(conn.ensureConnected()).rejects.toThrow("timed out");
      expect(conn.getState()).toBe("error");
    });

    it("cleans up transport on connect failure", async () => {
      mocks.clientConnect.mockRejectedValueOnce(new Error("refused"));
      const conn = new McpServerConnection("test", makeConfig());
      await expect(conn.ensureConnected()).rejects.toThrow("refused");
      expect(mocks.stdioClose).toHaveBeenCalled();
    });

    it("cleans up transport on timeout", async () => {
      mocks.clientConnect.mockImplementation(() => new Promise(() => {}));
      const conn = new McpServerConnection(
        "test",
        makeConfig({ connectTimeout: 50 }),
      );
      await expect(conn.ensureConnected()).rejects.toThrow("timed out");
      expect(mocks.stdioClose).toHaveBeenCalled();
    });

    it("retries connection after error state", async () => {
      mocks.clientConnect.mockRejectedValueOnce(new Error("refused"));
      const conn = new McpServerConnection("test", makeConfig());
      await expect(conn.ensureConnected()).rejects.toThrow("refused");
      expect(conn.getState()).toBe("error");

      // Second attempt succeeds
      mocks.clientConnect.mockResolvedValueOnce(undefined);
      await conn.ensureConnected();
      expect(conn.getState()).toBe("connected");
    });

    it("drains stderr for stdio transports", async () => {
      const conn = new McpServerConnection("test", makeConfig());
      await conn.ensureConnected();
      expect(mocks.stderrResume).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Tool discovery
  // =========================================================================

  describe("discoverTools", () => {
    it("discovers and returns tools", async () => {
      mocks.clientListTools.mockResolvedValue({
        tools: [
          {
            name: "tool_a",
            description: "Tool A",
            inputSchema: { type: "object" },
          },
          { name: "tool_b", description: "Tool B" },
        ],
      });

      const conn = new McpServerConnection("test", makeConfig());
      const tools = await conn.discoverTools();

      expect(tools).toHaveLength(2);
      expect(tools[0]).toEqual({
        name: "tool_a",
        description: "Tool A",
        inputSchema: { type: "object" },
        serverKey: "test",
      });
      expect(conn.getDiscoveredTools()).toHaveLength(2);
    });

    it("filters by allowedTools", async () => {
      mocks.clientListTools.mockResolvedValue({
        tools: [
          { name: "tool_a", description: "A" },
          { name: "tool_b", description: "B" },
          { name: "tool_c", description: "C" },
        ],
      });

      const conn = new McpServerConnection(
        "test",
        makeConfig({ allowedTools: ["tool_a", "tool_c"] }),
      );
      const tools = await conn.discoverTools();
      expect(tools.map((t) => t.name)).toEqual(["tool_a", "tool_c"]);
    });

    it("filters by blockedTools", async () => {
      mocks.clientListTools.mockResolvedValue({
        tools: [
          { name: "tool_a", description: "A" },
          { name: "tool_b", description: "B" },
        ],
      });

      const conn = new McpServerConnection(
        "test",
        makeConfig({ blockedTools: ["tool_b"] }),
      );
      const tools = await conn.discoverTools();
      expect(tools.map((t) => t.name)).toEqual(["tool_a"]);
    });

    it("times out on slow listTools", async () => {
      mocks.clientListTools.mockImplementation(() => new Promise(() => {}));
      const conn = new McpServerConnection(
        "test",
        makeConfig({ connectTimeout: 50 }),
      );
      await expect(conn.discoverTools()).rejects.toThrow("timed out");
    });
  });

  // =========================================================================
  // Tool calling
  // =========================================================================

  describe("callTool", () => {
    it("calls tool and returns result", async () => {
      const mockResult = {
        content: [{ type: "text", text: "hello" }],
      };
      mocks.clientCallTool.mockResolvedValue(mockResult);

      const conn = new McpServerConnection("test", makeConfig());
      const result = await conn.callTool("my_tool", { arg: "val" });
      expect(result).toEqual(mockResult);
    });

    it("passes metadata as _meta", async () => {
      mocks.clientCallTool.mockResolvedValue({});
      const conn = new McpServerConnection("test", makeConfig());
      await conn.callTool("my_tool", {}, { userId: "u1" });

      expect(mocks.clientCallTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "my_tool",
          arguments: {},
          _meta: { userId: "u1" },
        }),
      );
    });

    it("times out on slow tool call", async () => {
      mocks.clientCallTool.mockImplementation(() => new Promise(() => {}));
      const conn = new McpServerConnection(
        "test",
        makeConfig({ toolTimeout: 50 }),
      );
      await expect(conn.callTool("slow_tool")).rejects.toThrow("timed out");
    });

    it("marks connection as errored for connection-level failures", async () => {
      mocks.clientCallTool.mockRejectedValueOnce(
        new Error("transport closed unexpectedly"),
      );
      const conn = new McpServerConnection("test", makeConfig());
      await conn.ensureConnected();

      await expect(conn.callTool("my_tool")).rejects.toThrow(
        "transport closed",
      );
      expect(conn.getState()).toBe("error");
    });

    it("does NOT mark connection as errored for tool-level failures", async () => {
      mocks.clientCallTool.mockRejectedValueOnce(
        new Error("invalid argument: foo is required"),
      );
      const conn = new McpServerConnection("test", makeConfig());
      await conn.ensureConnected();

      await expect(conn.callTool("my_tool")).rejects.toThrow(
        "invalid argument",
      );
      // Connection should still be "connected" — not poisoned
      expect(conn.getState()).toBe("connected");
    });
  });

  // =========================================================================
  // Disconnect
  // =========================================================================

  describe("disconnect", () => {
    it("disconnects and resets state", async () => {
      const conn = new McpServerConnection("test", makeConfig());
      await conn.ensureConnected();
      expect(conn.getState()).toBe("connected");

      await conn.disconnect();
      expect(conn.getState()).toBe("disconnected");
      expect(mocks.clientClose).toHaveBeenCalled();
    });

    it("is safe to call when already disconnected", async () => {
      const conn = new McpServerConnection("test", makeConfig());
      await conn.disconnect(); // should not throw
      expect(conn.getState()).toBe("disconnected");
    });

    it("swallows close errors", async () => {
      mocks.clientClose.mockRejectedValueOnce(new Error("close failed"));
      const conn = new McpServerConnection("test", makeConfig());
      await conn.ensureConnected();
      await conn.disconnect(); // should not throw
      expect(conn.getState()).toBe("disconnected");
    });
  });

  // =========================================================================
  // Accessors
  // =========================================================================

  describe("accessors", () => {
    it("returns server key", () => {
      const conn = new McpServerConnection("my-key", makeConfig());
      expect(conn.getServerKey()).toBe("my-key");
    });

    it("returns config", () => {
      const cfg = makeConfig();
      const conn = new McpServerConnection("test", cfg);
      expect(conn.getConfig()).toBe(cfg);
    });
  });
});
