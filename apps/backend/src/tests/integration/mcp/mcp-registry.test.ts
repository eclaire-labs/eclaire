/**
 * MCP Registry Integration Tests
 *
 * Tests McpRegistry with real McpServerConnections wired to in-process
 * MCP servers. The registry creates connections internally, so we mock
 * only the McpServerConnection constructor to inject test transports.
 * All other logic (tool discovery, RuntimeToolDefinition creation,
 * tool calling) runs real code over real JSON-RPC.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestMcpServer, type TestMcpServer } from "@eclaire/ai";
import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Transport registry — maps server keys to in-process transports
// ---------------------------------------------------------------------------

const transportMap = new Map<string, InMemoryTransport>();

vi.mock("@eclaire/ai", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const OriginalConnection = actual.McpServerConnection as any;

  class McpServerConnectionWithTransport extends OriginalConnection {
    constructor(serverKey: string, config: any) {
      const testTransport = transportMap.get(serverKey);
      super(serverKey, config, testTransport);
    }
  }

  return {
    ...actual,
    McpServerConnection: McpServerConnectionWithTransport,
  };
});

// Must import after mock
import { McpRegistry } from "../../../lib/mcp/registry.js";

// Suppress logger output
vi.mock("../../../lib/logger.js", () => ({
  createChildLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../../config/index.js", () => ({
  config: { isContainer: false },
}));

vi.mock("../../../lib/browser/command.js", () => ({
  resolveBrowserCommand: vi.fn(() => "/usr/bin/test-cmd"),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const servers: TestMcpServer[] = [];

async function registerServer(
  key: string,
  tools: Array<{
    name: string;
    description?: string;
    schema?: Record<string, z.ZodTypeAny>;
    handler?: (args: Record<string, unknown>) => any;
  }>,
): Promise<TestMcpServer> {
  const ts = await createTestMcpServer({
    name: key,
    tools: tools.map((t) => ({
      ...t,
      handler:
        t.handler ??
        (() => ({
          content: [{ type: "text" as const, text: `result from ${t.name}` }],
        })),
    })),
  });
  transportMap.set(key, ts.clientTransport);
  servers.push(ts);
  return ts;
}

afterEach(async () => {
  transportMap.clear();
  for (const s of servers) {
    await s.close().catch(() => {});
  }
  servers.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("McpRegistry - real tool discovery and mapping", () => {
  // =========================================================================
  // Initialization
  // =========================================================================

  describe("initialize with autoConnect servers", () => {
    it("discovers tools and exposes as RuntimeToolDefinitions (individual mode)", async () => {
      await registerServer("fs-server", [
        { name: "read_file", description: "Read a file" },
        { name: "write_file", description: "Write a file" },
      ]);

      const registry = new McpRegistry({
        "fs-server": {
          name: "Filesystem",
          transport: "stdio",
          command: "fs-server",
          autoConnect: true,
          toolMode: "individual",
        },
      });
      await registry.initialize();

      const tools = registry.getMcpTools();
      const names = Object.keys(tools).sort();
      expect(names).toEqual(["read_file", "write_file"]);

      await registry.disconnectAll();
    });

    it("grouped mode: all tools collapse into one RuntimeToolDefinition", async () => {
      await registerServer("grouped-server", [
        { name: "list_pages", description: "List pages" },
        { name: "navigate", description: "Navigate to URL" },
        { name: "click", description: "Click element" },
      ]);

      const registry = new McpRegistry({
        "grouped-server": {
          name: "Browser",
          transport: "stdio",
          command: "grouped-server",
          autoConnect: true,
          toolMode: "grouped",
          groupedToolName: "browse",
        },
      });
      await registry.initialize();

      const tools = registry.getMcpTools();
      expect(Object.keys(tools)).toEqual(["browse"]);
      // The grouped tool should have a description listing actions
      expect(tools.browse.description).toContain("list_pages");
      expect(tools.browse.description).toContain("navigate");

      await registry.disconnectAll();
    });

    it("multiple servers with different toolModes initialize concurrently", async () => {
      await registerServer("individual-srv", [
        { name: "tool_a" },
        { name: "tool_b" },
      ]);
      await registerServer("grouped-srv", [
        { name: "action_x" },
        { name: "action_y" },
      ]);

      const registry = new McpRegistry({
        "individual-srv": {
          name: "Individual",
          transport: "stdio",
          command: "individual-srv",
          autoConnect: true,
          toolMode: "individual",
        },
        "grouped-srv": {
          name: "Grouped",
          transport: "stdio",
          command: "grouped-srv",
          autoConnect: true,
          toolMode: "grouped",
          groupedToolName: "group_tool",
        },
      });
      await registry.initialize();

      const tools = registry.getMcpTools();
      expect(Object.keys(tools).sort()).toEqual([
        "group_tool",
        "tool_a",
        "tool_b",
      ]);

      await registry.disconnectAll();
    });

    it("skips managed-mode servers during auto-discovery", async () => {
      await registerServer("managed-srv", [{ name: "should_not_appear" }]);

      const registry = new McpRegistry({
        "managed-srv": {
          name: "Managed",
          transport: "stdio",
          command: "managed-srv",
          autoConnect: true,
          toolMode: "managed",
        },
      });
      await registry.initialize();

      const tools = registry.getMcpTools();
      expect(Object.keys(tools)).toEqual([]);

      await registry.disconnectAll();
    });

    it("gracefully handles one server failing while others succeed", async () => {
      await registerServer("good-srv", [{ name: "good_tool" }]);
      // Don't register a transport for "bad-srv" — connection will fail

      const registry = new McpRegistry({
        "good-srv": {
          name: "Good",
          transport: "stdio",
          command: "good-srv",
          autoConnect: true,
        },
        "bad-srv": {
          name: "Bad",
          transport: "stdio",
          command: "bad-srv",
          autoConnect: true,
        },
      });

      // Should not throw — uses Promise.allSettled
      await registry.initialize();

      const tools = registry.getMcpTools();
      expect(Object.keys(tools)).toEqual(["good_tool"]);

      await registry.disconnectAll();
    });
  });

  // =========================================================================
  // RuntimeToolDefinition Execution
  // =========================================================================

  describe("RuntimeToolDefinition execution", () => {
    it("individual tool execute() calls the real MCP server", async () => {
      await registerServer("exec-srv", [
        {
          name: "greet",
          description: "Greet someone",
          schema: { name: z.string() },
          handler: (args) => ({
            content: [{ type: "text" as const, text: `Hello, ${args.name}!` }],
          }),
        },
      ]);

      const registry = new McpRegistry({
        "exec-srv": {
          name: "Exec",
          transport: "stdio",
          command: "exec-srv",
          autoConnect: true,
        },
      });
      await registry.initialize();

      const tools = registry.getMcpTools();
      const result = await tools.greet.execute!("call-1", { name: "Alice" }, {
        userId: "user-1",
      } as any);

      expect(result.content[0]).toEqual({
        type: "text",
        text: "Hello, Alice!",
      });
      expect(result.isError).toBeFalsy();

      await registry.disconnectAll();
    });

    it("grouped tool execute() dispatches to the correct action", async () => {
      await registerServer("grouped-exec", [
        {
          name: "add",
          schema: { a: z.number(), b: z.number() },
          handler: (args) => ({
            content: [
              {
                type: "text" as const,
                text: String(Number(args.a) + Number(args.b)),
              },
            ],
          }),
        },
        {
          name: "subtract",
          schema: { a: z.number(), b: z.number() },
          handler: (args) => ({
            content: [
              {
                type: "text" as const,
                text: String(Number(args.a) - Number(args.b)),
              },
            ],
          }),
        },
      ]);

      const registry = new McpRegistry({
        "grouped-exec": {
          name: "Math",
          transport: "stdio",
          command: "grouped-exec",
          autoConnect: true,
          toolMode: "grouped",
          groupedToolName: "math",
        },
      });
      await registry.initialize();

      const tools = registry.getMcpTools();

      const addResult = await tools.math.execute!(
        "call-1",
        { action: "add", args: { a: 10, b: 5 } },
        { userId: "user-1" } as any,
      );
      expect(addResult.content[0]).toEqual({ type: "text", text: "15" });

      const subResult = await tools.math.execute!(
        "call-2",
        { action: "subtract", args: { a: 10, b: 3 } },
        { userId: "user-1" } as any,
      );
      expect(subResult.content[0]).toEqual({ type: "text", text: "7" });

      await registry.disconnectAll();
    });

    it("toolPrefix is applied correctly in individual mode", async () => {
      await registerServer("prefix-srv", [
        { name: "read", description: "Read" },
        { name: "write", description: "Write" },
      ]);

      const registry = new McpRegistry({
        "prefix-srv": {
          name: "FS",
          transport: "stdio",
          command: "prefix-srv",
          autoConnect: true,
          toolPrefix: "fs",
        },
      });
      await registry.initialize();

      const tools = registry.getMcpTools();
      expect(Object.keys(tools).sort()).toEqual(["fs_read", "fs_write"]);

      await registry.disconnectAll();
    });
  });

  // =========================================================================
  // Tool-to-Server Mapping
  // =========================================================================

  describe("tool-to-server mapping", () => {
    it("getServerKeyForTool returns correct server key", async () => {
      await registerServer("map-srv", [{ name: "mapped_tool" }]);

      const registry = new McpRegistry({
        "map-srv": {
          name: "Map",
          transport: "stdio",
          command: "map-srv",
          autoConnect: true,
        },
      });
      await registry.initialize();

      expect(registry.getServerKeyForTool("mapped_tool")).toBe("map-srv");
      expect(registry.getServerKeyForTool("unknown_tool")).toBeUndefined();

      await registry.disconnectAll();
    });

    it("isMcpTool returns true for discovered tools, false for unknown", async () => {
      await registerServer("check-srv", [{ name: "check_tool" }]);

      const registry = new McpRegistry({
        "check-srv": {
          name: "Check",
          transport: "stdio",
          command: "check-srv",
          autoConnect: true,
        },
      });
      await registry.initialize();

      expect(registry.isMcpTool("check_tool")).toBe(true);
      expect(registry.isMcpTool("nonexistent")).toBe(false);

      await registry.disconnectAll();
    });
  });

  // =========================================================================
  // Lifecycle
  // =========================================================================

  describe("lifecycle", () => {
    it("disconnectAll disconnects all real connections", async () => {
      await registerServer("dc-srv", [{ name: "dc_tool" }]);

      const registry = new McpRegistry({
        "dc-srv": {
          name: "DC",
          transport: "stdio",
          command: "dc-srv",
          autoConnect: true,
        },
      });
      await registry.initialize();

      await registry.disconnectAll();

      const status = registry.getStatus();
      expect(status[0].state).toBe("disconnected");
    });

    it("getStatus returns accurate state after initialization", async () => {
      await registerServer("status-srv", [
        { name: "s_tool_1" },
        { name: "s_tool_2" },
      ]);

      const registry = new McpRegistry({
        "status-srv": {
          name: "Status",
          transport: "stdio",
          command: "status-srv",
          autoConnect: true,
        },
      });
      await registry.initialize();

      const status = registry.getStatus();
      expect(status).toHaveLength(1);
      expect(status[0]).toMatchObject({
        key: "status-srv",
        name: "Status",
        state: "connected",
        toolMode: "individual",
        toolCount: 2,
      });

      await registry.disconnectAll();
    });
  });
});
