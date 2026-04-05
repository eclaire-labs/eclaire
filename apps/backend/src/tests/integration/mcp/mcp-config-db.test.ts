/**
 * MCP Config Database Integration Tests
 *
 * Tests MCP server CRUD operations and config loading against real
 * in-memory SQLite and PGlite databases. No database mocking — only
 * the db singleton is redirected to the test database.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DB_TEST_CONFIGS,
  initTestDatabase,
  type TestDatabase,
} from "../../db/setup.js";
import { seedMcpServer } from "./helpers/seed-mcp-server.js";

// ---------------------------------------------------------------------------
// Module mocks — redirect db singleton to the per-test in-memory database
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

// Mock fs to prevent JSON file fallback from hitting the real filesystem
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
}));

// Dynamic module references — set in beforeEach after schema is configured
type AiConfigModule = typeof import("../../../lib/services/ai-config.js");
type ConfigModule = typeof import("../../../lib/mcp/config.js");

let listMcpServers: AiConfigModule["listMcpServers"];
let getMcpServer: AiConfigModule["getMcpServer"];
let createMcpServer: AiConfigModule["createMcpServer"];
let updateMcpServer: AiConfigModule["updateMcpServer"];
let deleteMcpServer: AiConfigModule["deleteMcpServer"];
let loadMcpServersConfig: ConfigModule["loadMcpServersConfig"];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.each(DB_TEST_CONFIGS)("$label - MCP Config Database Integration", ({
  dbType,
}) => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDb = await initTestDatabase(dbType);
    _testRef.db = testDb.db;
    _testRef.schema = testDb.schema;

    // Re-import with fresh module state to pick up the mocked db
    vi.resetModules();
    const aiConfig = await import("../../../lib/services/ai-config.js");
    listMcpServers = aiConfig.listMcpServers;
    getMcpServer = aiConfig.getMcpServer;
    createMcpServer = aiConfig.createMcpServer;
    updateMcpServer = aiConfig.updateMcpServer;
    deleteMcpServer = aiConfig.deleteMcpServer;

    const configMod = await import("../../../lib/mcp/config.js");
    loadMcpServersConfig = configMod.loadMcpServersConfig;
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  describe("MCP server CRUD", () => {
    it("createMcpServer inserts a row and getMcpServer retrieves it", async () => {
      await createMcpServer("test-srv", {
        name: "Test Server",
        transport: "stdio",
        command: "test-cmd",
      });

      const server = await getMcpServer("test-srv");
      expect(server).toBeDefined();
      expect(server!.id).toBe("test-srv");
      expect(server!.name).toBe("Test Server");
      expect(server!.transport).toBe("stdio");
      expect(server!.command).toBe("test-cmd");
      expect(server!.enabled).toBe(true);
    });

    it("createMcpServer with all fields", async () => {
      await createMcpServer("full-srv", {
        name: "Full Server",
        description: "A fully configured server",
        transport: "http",
        command: "http://localhost:3001/mcp",
        args: ["--verbose", "--port=3001"],
        connectTimeout: 5000,
        enabled: true,
        toolMode: "grouped",
        availability: { requireLocal: true, requireHumanAuth: true },
      });

      const server = await getMcpServer("full-srv");
      expect(server!.description).toBe("A fully configured server");
      expect(server!.transport).toBe("http");
      expect(server!.args).toEqual(["--verbose", "--port=3001"]);
      expect(server!.connectTimeout).toBe(5000);
      expect(server!.toolMode).toBe("grouped");
      expect(server!.availability).toEqual({
        requireLocal: true,
        requireHumanAuth: true,
      });
    });

    it("createMcpServer rejects duplicate IDs", async () => {
      await createMcpServer("dup-srv", {
        name: "First",
        transport: "stdio",
      });

      await expect(
        createMcpServer("dup-srv", { name: "Second", transport: "stdio" }),
      ).rejects.toThrow(/already exists/);
    });

    it("updateMcpServer modifies fields and preserves others", async () => {
      await createMcpServer("upd-srv", {
        name: "Original",
        transport: "stdio",
        command: "original-cmd",
      });

      await updateMcpServer("upd-srv", { name: "Updated", command: "new-cmd" });

      const server = await getMcpServer("upd-srv");
      expect(server!.name).toBe("Updated");
      expect(server!.command).toBe("new-cmd");
      expect(server!.transport).toBe("stdio"); // Preserved
    });

    it("updateMcpServer rejects non-existent server", async () => {
      await expect(
        updateMcpServer("nonexistent", { name: "New" }),
      ).rejects.toThrow();
    });

    it("deleteMcpServer removes the row", async () => {
      await createMcpServer("del-srv", {
        name: "To Delete",
        transport: "stdio",
      });

      await deleteMcpServer("del-srv");

      const server = await getMcpServer("del-srv");
      expect(server).toBeUndefined();
    });

    it("deleteMcpServer rejects non-existent server", async () => {
      await expect(deleteMcpServer("nonexistent")).rejects.toThrow();
    });

    it("listMcpServers returns all servers", async () => {
      await createMcpServer("srv-1", { name: "Server 1", transport: "stdio" });
      await createMcpServer("srv-2", { name: "Server 2", transport: "sse" });

      const servers = await listMcpServers();
      expect(servers).toHaveLength(2);
      const ids = servers.map((s) => s.id).sort();
      expect(ids).toEqual(["srv-1", "srv-2"]);
    });

    it("listMcpServers returns empty array when table is empty", async () => {
      const servers = await listMcpServers();
      expect(servers).toEqual([]);
    });
  });

  // =========================================================================
  // Config Loading
  // =========================================================================

  describe("config loading from DB", () => {
    it("loadMcpServersConfig loads enabled servers from DB", async () => {
      await seedMcpServer(testDb, {
        id: "fs-srv",
        name: "Filesystem",
        transport: "stdio",
        command: "fs-cmd",
        enabled: true,
      });

      const config = await loadMcpServersConfig();
      expect(config["fs-srv"]).toBeDefined();
      expect(config["fs-srv"]!.name).toBe("Filesystem");
      expect(config["fs-srv"]!.transport).toBe("stdio");
      expect(config["fs-srv"]!.command).toBe("fs-cmd");
    });

    it("loadMcpServersConfig skips disabled servers", async () => {
      await seedMcpServer(testDb, {
        id: "disabled-srv",
        name: "Disabled",
        enabled: false,
      });

      const config = await loadMcpServersConfig();
      // Only chrome-devtools should be present (auto-generated)
      expect(config["disabled-srv"]).toBeUndefined();
    });

    it("loadMcpServersConfig normalizes http transport to streamable-http", async () => {
      await seedMcpServer(testDb, {
        id: "http-srv",
        name: "HTTP Server",
        transport: "http",
        command: "http://localhost:3001/mcp",
      });

      const config = await loadMcpServersConfig();
      expect(config["http-srv"]!.transport).toBe("streamable-http");
    });

    it("loadMcpServersConfig maps command to url for HTTP transports", async () => {
      await seedMcpServer(testDb, {
        id: "http-url-srv",
        name: "HTTP URL",
        transport: "http",
        command: "http://localhost:3001/mcp",
      });

      const config = await loadMcpServersConfig();
      expect(config["http-url-srv"]!.url).toBe("http://localhost:3001/mcp");
      expect(config["http-url-srv"]!.command).toBeUndefined();
    });

    it("loadMcpServersConfig maps command to url for SSE transports", async () => {
      await seedMcpServer(testDb, {
        id: "sse-srv",
        name: "SSE Server",
        transport: "sse",
        command: "http://localhost:3001/sse",
      });

      const config = await loadMcpServersConfig();
      expect(config["sse-srv"]!.url).toBe("http://localhost:3001/sse");
      expect(config["sse-srv"]!.command).toBeUndefined();
    });

    it("loadMcpServersConfig preserves command for stdio transport", async () => {
      await seedMcpServer(testDb, {
        id: "stdio-srv",
        name: "Stdio Server",
        transport: "stdio",
        command: "my-mcp-server",
      });

      const config = await loadMcpServersConfig();
      expect(config["stdio-srv"]!.command).toBe("my-mcp-server");
      expect(config["stdio-srv"]!.url).toBeUndefined();
    });

    it("loadMcpServersConfig always generates chrome-devtools entry", async () => {
      await seedMcpServer(testDb, {
        id: "some-srv",
        name: "Some Server",
        transport: "stdio",
        command: "some-cmd",
      });

      const config = await loadMcpServersConfig();
      expect(config["chrome-devtools"]).toBeDefined();
      expect(config["chrome-devtools"]!.name).toBe("Chrome DevTools");
      expect(config["chrome-devtools"]!.toolMode).toBe("managed");
    });

    it("loadMcpServersConfig preserves existing chrome-devtools from DB", async () => {
      await seedMcpServer(testDb, {
        id: "chrome-devtools",
        name: "Custom Chrome",
        transport: "stdio",
        command: "custom-chrome-mcp",
        toolMode: "managed",
      });

      const config = await loadMcpServersConfig();
      expect(config["chrome-devtools"]).toBeDefined();
      // The DB entry should take precedence; the auto-generated one
      // should not overwrite it
      expect(config["chrome-devtools"]!.command).toBe("custom-chrome-mcp");
    });
  });

  // =========================================================================
  // JSON Serialization Round-trips
  // =========================================================================

  describe("JSON serialization round-trips", () => {
    it("string[] args round-trip through DB correctly", async () => {
      const args = ["--verbose", "--port=3001", "--config=/etc/mcp.json"];
      await createMcpServer("args-srv", {
        name: "Args Test",
        transport: "stdio",
        args,
      });

      const server = await getMcpServer("args-srv");
      expect(server!.args).toEqual(args);
    });

    it("availability object round-trips through DB correctly", async () => {
      const availability = {
        requireLocal: true,
        requireHumanAuth: false,
        disableInBackground: true,
      };
      await createMcpServer("avail-srv", {
        name: "Avail Test",
        transport: "stdio",
        availability,
      });

      const server = await getMcpServer("avail-srv");
      expect(server!.availability).toEqual(availability);
    });

    it("null args and null availability handled correctly", async () => {
      await createMcpServer("null-srv", {
        name: "Null Test",
        transport: "stdio",
      });

      const server = await getMcpServer("null-srv");
      expect(server!.args).toBeNull();
      expect(server!.availability).toBeNull();
    });
  });
});
