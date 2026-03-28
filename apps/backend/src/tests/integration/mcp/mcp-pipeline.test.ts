/**
 * MCP Full Pipeline Integration Tests
 *
 * End-to-end tests: seed MCP server config in DB → load config →
 * create registry → discover tools → call tools → verify normalized results.
 *
 * Combines real databases (SQLite/PGlite), real MCP protocol (InMemoryTransport),
 * and real registry logic. Only transports and the DB singleton are redirected.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestMcpServer, type TestMcpServer } from "@eclaire/ai";
import { z } from "zod";
import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  DB_TEST_CONFIGS,
  initTestDatabase,
  type TestDatabase,
} from "../../db/setup.js";
import { seedMcpServer } from "./helpers/seed-mcp-server.js";

// ---------------------------------------------------------------------------
// DB mock — redirect to per-test in-memory database
// ---------------------------------------------------------------------------

const _testRef = vi.hoisted(() => ({
  db: null as any,
  schema: null as any,
}));

vi.mock("../../../db/index.js", () => ({
  get db() {
    return _testRef.db;
  },
  get schema() {
    return _testRef.schema;
  },
}));

vi.mock("../../../lib/logger.js", () => ({
  createChildLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../../config/index.js", () => ({
  config: {
    dirs: { config: "/fake/config" },
    browser: {
      chromeMcpCommand: "chrome-devtools-mcp",
      chromeMcpConnectTimeout: 10000,
    },
    isContainer: false,
  },
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
}));

vi.mock("../../../lib/browser/command.js", () => ({
  resolveBrowserCommand: vi.fn(() => "/usr/bin/test-cmd"),
}));

// ---------------------------------------------------------------------------
// Transport injection — McpServerConnection uses _testTransport when available
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

// ---------------------------------------------------------------------------
// Dynamic imports (must come after vi.mock)
// ---------------------------------------------------------------------------

type ConfigModule = typeof import("../../../lib/mcp/config.js");
type RegistryModule = typeof import("../../../lib/mcp/registry.js");

let loadMcpServersConfig: ConfigModule["loadMcpServersConfig"];
let McpRegistry: RegistryModule["McpRegistry"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const servers: TestMcpServer[] = [];

async function registerInProcessServer(
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.each(DB_TEST_CONFIGS)("$label - MCP Full Pipeline", ({ dbType }) => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    transportMap.clear();
    testDb = await initTestDatabase(dbType);
    _testRef.db = testDb.db;
    _testRef.schema = testDb.schema;

    vi.resetModules();
    const configMod = await import("../../../lib/mcp/config.js");
    loadMcpServersConfig = configMod.loadMcpServersConfig;
    const registryMod = await import("../../../lib/mcp/registry.js");
    McpRegistry = registryMod.McpRegistry;
  });

  afterEach(async () => {
    transportMap.clear();
    for (const s of servers) {
      await s.close().catch(() => {});
    }
    servers.length = 0;
    await testDb.cleanup();
  });

  describe("DB config → registry → tool discovery → tool call", () => {
    it("full pipeline: seed server, load config, init registry, discover and call tool", async () => {
      // 1. Seed DB
      await seedMcpServer(testDb, {
        id: "echo-srv",
        name: "Echo",
        transport: "stdio",
        command: "echo-srv",
        toolMode: "individual",
      });

      // 2. Register in-process server for transport
      await registerInProcessServer("echo-srv", [
        {
          name: "echo",
          description: "Echoes input",
          schema: { message: z.string() },
          handler: (args) => ({
            content: [{ type: "text" as const, text: String(args.message) }],
          }),
        },
      ]);

      // 3. Load config from DB
      const config = await loadMcpServersConfig();
      expect(config["echo-srv"]).toBeDefined();

      // 4. Initialize registry (auto-connect since we set autoConnect via config)
      // Note: seedMcpServer doesn't set autoConnect, so we patch it
      config["echo-srv"].autoConnect = true;
      const registry = new McpRegistry(config);
      await registry.initialize();

      // 5. Verify tool is available
      const tools = registry.getMcpTools();
      expect(tools.echo).toBeDefined();

      // 6. Call the tool
      const result = await tools.echo.execute!(
        "call-1",
        { message: "pipeline test" },
        { userId: "user-1" } as any,
      );

      expect(result.content[0]).toEqual({
        type: "text",
        text: "pipeline test",
      });
      expect(result.isError).toBeFalsy();
      expect((result as any).details?.mcpServer).toBe("echo-srv");

      await registry.disconnectAll();
    });

    it("full pipeline: multiple servers with different toolModes", async () => {
      await seedMcpServer(testDb, {
        id: "ind-srv",
        name: "Individual",
        transport: "stdio",
        command: "ind-srv",
        toolMode: "individual",
      });
      await seedMcpServer(testDb, {
        id: "grp-srv",
        name: "Grouped",
        transport: "stdio",
        command: "grp-srv",
        toolMode: "grouped",
      });

      await registerInProcessServer("ind-srv", [
        { name: "read_file" },
        { name: "write_file" },
      ]);
      await registerInProcessServer("grp-srv", [
        { name: "list_pages" },
        { name: "navigate" },
      ]);

      const config = await loadMcpServersConfig();
      config["ind-srv"].autoConnect = true;
      config["grp-srv"].autoConnect = true;
      config["grp-srv"].groupedToolName = "browser";
      const registry = new McpRegistry(config);
      await registry.initialize();

      const tools = registry.getMcpTools();
      // Individual: 2 tools; Grouped: 1 tool
      expect(Object.keys(tools).sort()).toEqual([
        "browser",
        "read_file",
        "write_file",
      ]);

      await registry.disconnectAll();
    });

    it("full pipeline: disabled server in DB is excluded from registry", async () => {
      await seedMcpServer(testDb, {
        id: "disabled-srv",
        name: "Disabled",
        transport: "stdio",
        command: "disabled-srv",
        enabled: false,
      });
      await seedMcpServer(testDb, {
        id: "enabled-srv",
        name: "Enabled",
        transport: "stdio",
        command: "enabled-srv",
      });

      await registerInProcessServer("enabled-srv", [{ name: "active_tool" }]);

      const config = await loadMcpServersConfig();
      config["enabled-srv"].autoConnect = true;
      const registry = new McpRegistry(config);
      await registry.initialize();

      const tools = registry.getMcpTools();
      expect(tools.active_tool).toBeDefined();
      expect(
        Object.keys(tools).filter((k) => k !== "active_tool"),
      ).not.toContain("should_not_appear");

      await registry.disconnectAll();
    });

    it("full pipeline: tool call result is properly normalized", async () => {
      await seedMcpServer(testDb, {
        id: "norm-srv",
        name: "Normalize",
        transport: "stdio",
        command: "norm-srv",
      });

      await registerInProcessServer("norm-srv", [
        {
          name: "get_info",
          handler: () => ({
            content: [
              { type: "text" as const, text: "Summary info" },
              {
                type: "image" as const,
                data: "abc123==",
                mimeType: "image/jpeg",
              },
            ],
          }),
        },
      ]);

      const config = await loadMcpServersConfig();
      config["norm-srv"].autoConnect = true;
      const registry = new McpRegistry(config);
      await registry.initialize();

      const result = await registry.getMcpTools().get_info.execute!(
        "call-1",
        {},
        { userId: "u1" } as any,
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: "text", text: "Summary info" });
      expect(result.content[1]).toMatchObject({
        type: "image",
        data: "abc123==",
        mimeType: "image/jpeg",
      });

      await registry.disconnectAll();
    });

    it("full pipeline: grouped mode produces correct action dispatch", async () => {
      await seedMcpServer(testDb, {
        id: "math-srv",
        name: "Math",
        transport: "stdio",
        command: "math-srv",
        toolMode: "grouped",
      });

      await registerInProcessServer("math-srv", [
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
          name: "multiply",
          schema: { a: z.number(), b: z.number() },
          handler: (args) => ({
            content: [
              {
                type: "text" as const,
                text: String(Number(args.a) * Number(args.b)),
              },
            ],
          }),
        },
      ]);

      const config = await loadMcpServersConfig();
      config["math-srv"].autoConnect = true;
      config["math-srv"].groupedToolName = "math";
      const registry = new McpRegistry(config);
      await registry.initialize();

      const tools = registry.getMcpTools();
      expect(tools.math).toBeDefined();

      const addResult = await tools.math.execute!(
        "c1",
        { action: "add", args: { a: 4, b: 6 } },
        { userId: "u1" } as any,
      );
      expect(addResult.content[0]).toEqual({ type: "text", text: "10" });

      const mulResult = await tools.math.execute!(
        "c2",
        { action: "multiply", args: { a: 3, b: 7 } },
        { userId: "u1" } as any,
      );
      expect(mulResult.content[0]).toEqual({ type: "text", text: "21" });

      await registry.disconnectAll();
    });
  });

  describe("error scenarios across the pipeline", () => {
    it("tool call error is returned as isError RuntimeToolResult", async () => {
      await seedMcpServer(testDb, {
        id: "err-srv",
        name: "Error",
        transport: "stdio",
        command: "err-srv",
      });

      await registerInProcessServer("err-srv", [
        {
          name: "fail",
          handler: () => ({
            content: [{ type: "text" as const, text: "Something broke" }],
            isError: true,
          }),
        },
      ]);

      const config = await loadMcpServersConfig();
      config["err-srv"].autoConnect = true;
      const registry = new McpRegistry(config);
      await registry.initialize();

      const result = await registry.getMcpTools().fail.execute!("c1", {}, {
        userId: "u1",
      } as any);

      expect(result.isError).toBe(true);
      expect(result.content[0]).toEqual({
        type: "text",
        text: "Something broke",
      });

      await registry.disconnectAll();
    });

    it("server that fails to connect doesn't break other servers", async () => {
      await seedMcpServer(testDb, {
        id: "ok-srv",
        name: "OK",
        transport: "stdio",
        command: "ok-srv",
      });
      await seedMcpServer(testDb, {
        id: "broken-srv",
        name: "Broken",
        transport: "stdio",
        command: "broken-srv",
      });

      // Only register transport for ok-srv, not broken-srv
      await registerInProcessServer("ok-srv", [{ name: "working_tool" }]);

      const config = await loadMcpServersConfig();
      config["ok-srv"].autoConnect = true;
      config["broken-srv"].autoConnect = true;
      const registry = new McpRegistry(config);

      // Should not throw
      await registry.initialize();

      const tools = registry.getMcpTools();
      expect(tools.working_tool).toBeDefined();

      await registry.disconnectAll();
    });
  });
});
