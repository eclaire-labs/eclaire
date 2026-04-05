import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockConnections = vi.hoisted(
  () => new Map<string, ReturnType<typeof createMockConn>>(),
);

function createMockConn() {
  return {
    discoverTools: vi.fn().mockResolvedValue([]),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue("disconnected"),
    getLastError: vi.fn().mockReturnValue(null),
    getServerKey: vi.fn(),
    getConfig: vi.fn(),
    getDiscoveredTools: vi.fn().mockReturnValue([]),
    ensureConnected: vi.fn(),
    callTool: vi.fn(),
  };
}

vi.mock("@eclaire/ai", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    // biome-ignore lint/complexity/useArrowFunction: Proxy construct target must be a regular function
    McpServerConnection: new Proxy(function () {}, {
      construct(_target, [key, _config]: [string, unknown]) {
        const conn = createMockConn();
        conn.getServerKey.mockReturnValue(key);
        mockConnections.set(key, conn);
        return conn as any;
      },
    }),
  };
});

vi.mock("../../lib/browser/command.js", () => ({
  resolveBrowserCommand: vi.fn((cmd: string) =>
    cmd === "installed-cmd" ? "/usr/bin/installed-cmd" : null,
  ),
}));

vi.mock("../../lib/logger.js", () => ({
  createChildLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../config/index.js", () => ({
  config: { isContainer: false },
}));

import { McpRegistry } from "../../lib/mcp/registry.js";
import type { McpServerConfig } from "@eclaire/ai";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    name: "Test Server",
    transport: "stdio",
    command: "/bin/test",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("McpRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnections.clear();
  });

  describe("constructor", () => {
    it("skips disabled servers", () => {
      const registry = new McpRegistry({
        a: makeConfig({ enabled: true }),
        b: makeConfig({ enabled: false }),
      });
      const status = registry.getStatus();
      expect(status).toHaveLength(1);
      expect(status[0]?.key).toBe("a");
    });

    it("registers enabled servers", () => {
      const registry = new McpRegistry({
        a: makeConfig(),
        b: makeConfig(),
      });
      expect(registry.getStatus()).toHaveLength(2);
    });
  });

  describe("initialize", () => {
    it("connects servers with autoConnect and exposes discovered tools", async () => {
      const registry = new McpRegistry({
        a: makeConfig({ autoConnect: true, toolMode: "individual" }),
      });

      const connA = mockConnections.get("a")!;
      connA.discoverTools.mockResolvedValue([
        {
          name: "tool1",
          description: "A test tool",
          inputSchema: {
            type: "object",
            properties: { x: { type: "number" } },
          },
          serverKey: "a",
        },
        {
          name: "tool2",
          description: "Another tool",
          inputSchema: {},
          serverKey: "a",
        },
      ]);

      await registry.initialize();

      expect(connA.discoverTools).toHaveBeenCalled();
      const tools = registry.getMcpTools();
      expect(Object.keys(tools)).toHaveLength(2);
      expect(tools.tool1).toBeDefined();
      expect(tools.tool2).toBeDefined();
      expect(tools.tool1.name).toBe("tool1");
      expect(tools.tool1.description).toBe("A test tool");
      // Verify tools are associated with the correct server
      expect(registry.getServerKeyForTool("tool1")).toBe("a");
      expect(registry.getServerKeyForTool("tool2")).toBe("a");
      expect(registry.isMcpTool("tool1")).toBe(true);
    });

    it("discovers tools from multiple servers independently", async () => {
      const registry = new McpRegistry({
        a: makeConfig({ autoConnect: true, toolMode: "individual" }),
        b: makeConfig({ autoConnect: true, toolMode: "individual" }),
      });

      mockConnections.get("a")!.discoverTools.mockResolvedValue([
        {
          name: "toolA",
          description: "From A",
          inputSchema: {},
          serverKey: "a",
        },
      ]);
      mockConnections.get("b")!.discoverTools.mockResolvedValue([
        {
          name: "toolB",
          description: "From B",
          inputSchema: {},
          serverKey: "b",
        },
      ]);

      await registry.initialize();

      const tools = registry.getMcpTools();
      expect(Object.keys(tools)).toHaveLength(2);
      expect(registry.getServerKeyForTool("toolA")).toBe("a");
      expect(registry.getServerKeyForTool("toolB")).toBe("b");
    });

    it("still exposes tools from healthy servers when one server fails", async () => {
      const registry = new McpRegistry({
        good: makeConfig({ autoConnect: true, toolMode: "individual" }),
        bad: makeConfig({ autoConnect: true, toolMode: "individual" }),
      });

      mockConnections.get("good")!.discoverTools.mockResolvedValue([
        {
          name: "goodTool",
          description: "Works",
          inputSchema: {},
          serverKey: "good",
        },
      ]);
      mockConnections
        .get("bad")!
        .discoverTools.mockRejectedValue(new Error("connection failed"));

      await registry.initialize();

      const tools = registry.getMcpTools();
      expect(Object.keys(tools)).toHaveLength(1);
      expect(tools.goodTool).toBeDefined();
    });

    it("skips managed-mode servers during auto-discovery", async () => {
      const registry = new McpRegistry({
        a: makeConfig({ autoConnect: true, toolMode: "managed" }),
      });
      await registry.initialize();
      const connA = mockConnections.get("a")!;
      expect(connA.discoverTools).not.toHaveBeenCalled();
    });

    it("does not throw when a server fails to connect", async () => {
      const registry = new McpRegistry({
        a: makeConfig({ autoConnect: true }),
      });
      const connA = mockConnections.get("a")!;
      connA.discoverTools.mockRejectedValue(new Error("connection failed"));
      // Should not throw — uses Promise.allSettled
      await registry.initialize();
      // No tools should be registered from the failed server
      expect(Object.keys(registry.getMcpTools())).toHaveLength(0);
    });
  });

  describe("registerManagedTool", () => {
    it("maps tool name to server key", () => {
      const registry = new McpRegistry({ chrome: makeConfig() });
      registry.registerManagedTool("browseChrome", "chrome");
      expect(registry.getServerKeyForTool("browseChrome")).toBe("chrome");
      expect(registry.isMcpTool("browseChrome")).toBe(true);
    });

    it("throws for unknown server key", () => {
      const registry = new McpRegistry({});
      expect(() => registry.registerManagedTool("tool", "nonexistent")).toThrow(
        "unknown server",
      );
    });
  });

  describe("getToolAvailability", () => {
    it("returns undefined for non-MCP tools", () => {
      const registry = new McpRegistry({});
      expect(registry.getToolAvailability("unknown_tool")).toBeUndefined();
    });

    it("returns available for a valid server", () => {
      const registry = new McpRegistry({
        srv: makeConfig({ transport: "stdio", command: "installed-cmd" }),
      });
      registry.registerManagedTool("myTool", "srv");
      const result = registry.getToolAvailability("myTool");
      expect(result?.availability).toBe("available");
    });
  });

  describe("getServerAvailability", () => {
    it("returns disabled for unknown server", () => {
      const registry = new McpRegistry({});
      expect(registry.getServerAvailability("nope").availability).toBe(
        "disabled",
      );
    });

    it("returns disabled when requireLocal and running in container", async () => {
      // Override config.isContainer
      const { config } = await import("../../config/index.js");
      (config as any).isContainer = true;

      const registry = new McpRegistry({
        srv: makeConfig({ availability: { requireLocal: true } }),
      });
      const result = registry.getServerAvailability("srv");
      expect(result.availability).toBe("disabled");
      expect(result.availabilityReason).toContain("local desktop");

      // Reset
      (config as any).isContainer = false;
    });

    it("returns setup_required when stdio command is not installed", () => {
      const registry = new McpRegistry({
        srv: makeConfig({ transport: "stdio", command: "missing-cmd" }),
      });
      const result = registry.getServerAvailability("srv");
      expect(result.availability).toBe("setup_required");
      expect(result.availabilityReason).toContain("missing-cmd");
    });

    it("returns available when stdio command is installed", () => {
      const registry = new McpRegistry({
        srv: makeConfig({ transport: "stdio", command: "installed-cmd" }),
      });
      expect(registry.getServerAvailability("srv").availability).toBe(
        "available",
      );
    });
  });

  describe("disconnectAll", () => {
    it("disconnects all connections", async () => {
      const registry = new McpRegistry({
        a: makeConfig(),
        b: makeConfig(),
      });
      await registry.disconnectAll();
      const connA = mockConnections.get("a")!;
      const connB = mockConnections.get("b")!;
      expect(connA.disconnect).toHaveBeenCalled();
      expect(connB.disconnect).toHaveBeenCalled();
    });
  });

  describe("getStatus", () => {
    it("returns status for all registered servers", () => {
      const registry = new McpRegistry({
        a: makeConfig({ name: "Server A", toolMode: "individual" }),
        b: makeConfig({ name: "Server B", toolMode: "managed" }),
      });
      const status = registry.getStatus();
      expect(status).toHaveLength(2);
      expect(status[0]).toMatchObject({
        key: "a",
        name: "Server A",
        toolMode: "individual",
      });
    });
  });
});
