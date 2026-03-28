import { describe, expect, it, vi } from "vitest";
import {
  normalizeMcpResult,
  mcpToolToRuntimeTool,
  mcpToolsToGroupedRuntimeTool,
} from "../mcp/tool-bridge.js";
import type { McpServerConfig, McpToolDescriptor } from "../mcp/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDescriptor(
  overrides: Partial<McpToolDescriptor> = {},
): McpToolDescriptor {
  return {
    name: "my_tool",
    description: "A test tool",
    inputSchema: { type: "object" },
    serverKey: "test-server",
    ...overrides,
  };
}

function makeConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    name: "Test Server",
    transport: "stdio",
    command: "/bin/test",
    ...overrides,
  };
}

function makeConnection(callToolResult: unknown = {}, callToolError?: Error) {
  return {
    callTool: callToolError
      ? vi.fn().mockRejectedValue(callToolError)
      : vi.fn().mockResolvedValue(callToolResult),
    ensureConnected: vi.fn(),
    disconnect: vi.fn(),
    getState: vi.fn().mockReturnValue("connected"),
    getLastError: vi.fn().mockReturnValue(null),
    getServerKey: vi.fn().mockReturnValue("test-server"),
    getConfig: vi.fn().mockReturnValue(makeConfig()),
    getDiscoveredTools: vi.fn().mockReturnValue([]),
    discoverTools: vi.fn().mockResolvedValue([]),
  } as any;
}

// ---------------------------------------------------------------------------
// normalizeMcpResult
// ---------------------------------------------------------------------------

describe("normalizeMcpResult", () => {
  it("normalizes text content", () => {
    const result = normalizeMcpResult(
      { content: [{ type: "text", text: "hello" }] },
      "srv",
    );
    expect(result.content).toEqual([{ type: "text", text: "hello" }]);
    expect(result.details).toEqual({ mcpServer: "srv" });
    expect(result.isError).toBe(false);
  });

  it("normalizes image content", () => {
    const result = normalizeMcpResult(
      {
        content: [{ type: "image", data: "base64data", mimeType: "image/png" }],
      },
      "srv",
    );
    expect(result.content).toEqual([
      { type: "image", data: "base64data", mimeType: "image/png" },
    ]);
  });

  it("normalizes mixed content", () => {
    const result = normalizeMcpResult(
      {
        content: [
          { type: "text", text: "caption" },
          { type: "image", data: "abc", mimeType: "image/jpeg" },
        ],
      },
      "srv",
    );
    expect(result.content).toHaveLength(2);
  });

  it("preserves isError flag", () => {
    const result = normalizeMcpResult(
      { content: [{ type: "text", text: "fail" }], isError: true },
      "srv",
    );
    expect(result.isError).toBe(true);
  });

  it("handles null result", () => {
    const result = normalizeMcpResult(null, "srv");
    expect(result.content).toEqual([{ type: "text", text: "" }]);
  });

  it("handles undefined result", () => {
    const result = normalizeMcpResult(undefined, "srv");
    expect(result.content).toEqual([{ type: "text", text: "" }]);
  });

  it("handles non-object result", () => {
    const result = normalizeMcpResult(42, "srv");
    expect(result.content).toEqual([{ type: "text", text: "42" }]);
  });

  it("falls back to JSON serialization for empty content array", () => {
    const raw = { content: [], extra: "data" };
    const result = normalizeMcpResult(raw, "srv");
    expect(result.content[0]?.type).toBe("text");
    expect(JSON.parse((result.content[0] as any).text)).toEqual(raw);
  });

  it("falls back to JSON serialization for unknown content types", () => {
    const raw = { content: [{ type: "video", src: "url" }] };
    const result = normalizeMcpResult(raw, "srv");
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
  });
});

// ---------------------------------------------------------------------------
// mcpToolToRuntimeTool (individual mode)
// ---------------------------------------------------------------------------

describe("mcpToolToRuntimeTool", () => {
  it("creates a RuntimeToolDefinition with correct name", () => {
    const tool = mcpToolToRuntimeTool(
      makeDescriptor(),
      makeConnection(),
      makeConfig(),
    );
    expect(tool.name).toBe("my_tool");
  });

  it("applies toolPrefix to name", () => {
    const tool = mcpToolToRuntimeTool(
      makeDescriptor(),
      makeConnection(),
      makeConfig({ toolPrefix: "ext" }),
    );
    expect(tool.name).toBe("ext_my_tool");
  });

  it("uses description from descriptor", () => {
    const tool = mcpToolToRuntimeTool(
      makeDescriptor({ description: "Does stuff" }),
      makeConnection(),
      makeConfig(),
    );
    expect(tool.description).toBe("Does stuff");
  });

  it("falls back to default description when missing", () => {
    const tool = mcpToolToRuntimeTool(
      makeDescriptor({ description: undefined }),
      makeConnection(),
      makeConfig(),
    );
    expect(tool.description).toContain("MCP tool");
  });

  it("defaults accessLevel to write", () => {
    const tool = mcpToolToRuntimeTool(
      makeDescriptor(),
      makeConnection(),
      makeConfig(),
    );
    expect(tool.accessLevel).toBe("write");
  });

  it("respects accessLevel from config", () => {
    const tool = mcpToolToRuntimeTool(
      makeDescriptor(),
      makeConnection(),
      makeConfig({ accessLevel: "read" }),
    );
    expect(tool.accessLevel).toBe("read");
  });

  it("execute calls connection.callTool and normalizes result", async () => {
    const conn = makeConnection({
      content: [{ type: "text", text: "result" }],
    });
    const tool = mcpToolToRuntimeTool(makeDescriptor(), conn, makeConfig());

    const result = await tool.execute("call1", { x: 1 }, {
      userId: "u1",
    } as any);
    expect(conn.callTool).toHaveBeenCalledWith(
      "my_tool",
      { x: 1 },
      { userId: "u1" },
    );
    expect(result.content[0]).toEqual({ type: "text", text: "result" });
  });

  it("execute catches errors and returns isError result", async () => {
    const conn = makeConnection(null, new Error("boom"));
    const tool = mcpToolToRuntimeTool(makeDescriptor(), conn, makeConfig());

    const result = await tool.execute("call1", {}, {} as any);
    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toBe("boom");
  });
});

// ---------------------------------------------------------------------------
// mcpToolsToGroupedRuntimeTool (grouped mode)
// ---------------------------------------------------------------------------

describe("mcpToolsToGroupedRuntimeTool", () => {
  const descriptors: McpToolDescriptor[] = [
    makeDescriptor({ name: "action_a", description: "Do A" }),
    makeDescriptor({ name: "action_b", description: "Do B" }),
  ];

  it("creates a single grouped tool with action enum in schema", () => {
    const tool = mcpToolsToGroupedRuntimeTool(
      descriptors,
      makeConnection(),
      makeConfig(),
    );
    expect(tool.name).toBe("Test Server");
    expect(tool.__rawJsonSchema).toBeDefined();
    const schema = tool.__rawJsonSchema as any;
    expect(schema.properties.action.enum).toEqual(["action_a", "action_b"]);
  });

  it("uses groupedToolName from config", () => {
    const tool = mcpToolsToGroupedRuntimeTool(
      descriptors,
      makeConnection(),
      makeConfig({ groupedToolName: "myGroup" }),
    );
    expect(tool.name).toBe("myGroup");
  });

  it("rejects unknown action", async () => {
    const tool = mcpToolsToGroupedRuntimeTool(
      descriptors,
      makeConnection(),
      makeConfig(),
    );
    const result = await tool.execute(
      "call1",
      { action: "nonexistent" },
      {} as any,
    );
    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toContain("Unknown action");
  });

  it("dispatches to correct action", async () => {
    const conn = makeConnection({
      content: [{ type: "text", text: "done" }],
    });
    const tool = mcpToolsToGroupedRuntimeTool(descriptors, conn, makeConfig());

    const result = await tool.execute(
      "call1",
      { action: "action_a", args: { x: 1 } },
      { userId: "u1" } as any,
    );
    expect(conn.callTool).toHaveBeenCalledWith(
      "action_a",
      { x: 1 },
      { userId: "u1" },
    );
    expect(result.content[0]).toEqual({ type: "text", text: "done" });
  });

  it("catches execution errors and returns isError", async () => {
    const conn = makeConnection(null, new Error("action failed"));
    const tool = mcpToolsToGroupedRuntimeTool(descriptors, conn, makeConfig());

    const result = await tool.execute(
      "call1",
      { action: "action_a" },
      {} as any,
    );
    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toBe("action failed");
  });
});
