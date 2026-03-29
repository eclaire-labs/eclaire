import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListMcpServers = vi.fn();

vi.mock("../../lib/services/ai-config.js", () => ({
  listMcpServers: () => mockListMcpServers(),
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
  config: {
    dirs: { config: "/fake/config" },
    browser: {
      chromeMcpCommand: "chrome-devtools-mcp",
      chromeMcpConnectTimeout: 10000,
    },
    isContainer: false,
  },
}));

// Mock fs so we don't hit the real filesystem
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
}));

import { loadMcpServersConfig } from "../../lib/mcp/config.js";
import { existsSync, readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadMcpServersConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListMcpServers.mockResolvedValue([]);
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it("loads servers from database", async () => {
    mockListMcpServers.mockResolvedValue([
      {
        id: "fs-server",
        name: "Filesystem",
        description: "File access",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
        connectTimeout: 5000,
        enabled: true,
        toolMode: "individual",
        availability: null,
      },
    ]);

    const servers = await loadMcpServersConfig();
    expect(servers["fs-server"]).toBeDefined();
    expect(servers["fs-server"]!.name).toBe("Filesystem");
    expect(servers["fs-server"]!.transport).toBe("stdio");
    expect(servers["fs-server"]!.command).toBe("npx");
  });

  it("skips disabled servers from database", async () => {
    mockListMcpServers.mockResolvedValue([
      {
        id: "disabled",
        name: "Off",
        transport: "stdio",
        command: "cmd",
        enabled: false,
        args: null,
        connectTimeout: null,
        toolMode: null,
        availability: null,
        description: null,
      },
    ]);

    const servers = await loadMcpServersConfig();
    expect(servers.disabled).toBeUndefined();
  });

  it("normalizes DB transport 'http' to 'streamable-http'", async () => {
    mockListMcpServers.mockResolvedValue([
      {
        id: "http-srv",
        name: "HTTP Server",
        transport: "http",
        command: "http://localhost:3001/mcp",
        enabled: true,
        args: null,
        connectTimeout: null,
        toolMode: null,
        availability: null,
        description: null,
      },
    ]);

    const servers = await loadMcpServersConfig();
    expect(servers["http-srv"]!.transport).toBe("streamable-http");
  });

  it("maps command to url for HTTP transport", async () => {
    mockListMcpServers.mockResolvedValue([
      {
        id: "http-srv",
        name: "HTTP",
        transport: "http",
        command: "http://localhost:3001/mcp",
        enabled: true,
        args: null,
        connectTimeout: null,
        toolMode: null,
        availability: null,
        description: null,
      },
    ]);

    const servers = await loadMcpServersConfig();
    expect(servers["http-srv"]!.url).toBe("http://localhost:3001/mcp");
    expect(servers["http-srv"]!.command).toBeUndefined();
  });

  it("maps command to url for SSE transport", async () => {
    mockListMcpServers.mockResolvedValue([
      {
        id: "sse-srv",
        name: "SSE",
        transport: "sse",
        command: "http://localhost:3001/sse",
        enabled: true,
        args: null,
        connectTimeout: null,
        toolMode: null,
        availability: null,
        description: null,
      },
    ]);

    const servers = await loadMcpServersConfig();
    expect(servers["sse-srv"]!.url).toBe("http://localhost:3001/sse");
    expect(servers["sse-srv"]!.command).toBeUndefined();
  });

  it("keeps command for stdio transport (not url)", async () => {
    mockListMcpServers.mockResolvedValue([
      {
        id: "stdio-srv",
        name: "Stdio",
        transport: "stdio",
        command: "npx",
        enabled: true,
        args: ["-y", "some-pkg"],
        connectTimeout: null,
        toolMode: null,
        availability: null,
        description: null,
      },
    ]);

    const servers = await loadMcpServersConfig();
    expect(servers["stdio-srv"]!.command).toBe("npx");
    expect(servers["stdio-srv"]!.url).toBeUndefined();
  });

  it("falls back to JSON file when DB is empty", async () => {
    mockListMcpServers.mockResolvedValue([]);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        servers: {
          "json-srv": {
            name: "From JSON",
            transport: "stdio",
            command: "test",
          },
        },
      }),
    );

    const servers = await loadMcpServersConfig();
    expect(servers["json-srv"]).toBeDefined();
    expect(servers["json-srv"]!.name).toBe("From JSON");
  });

  it("falls back to JSON file when DB throws", async () => {
    mockListMcpServers.mockRejectedValue(new Error("db error"));
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        servers: {
          "json-srv": {
            name: "Fallback",
            transport: "stdio",
            command: "test",
          },
        },
      }),
    );

    const servers = await loadMcpServersConfig();
    expect(servers["json-srv"]).toBeDefined();
  });

  it("always generates chrome-devtools entry if not present", async () => {
    mockListMcpServers.mockResolvedValue([]);
    const servers = await loadMcpServersConfig();
    expect(servers["chrome-devtools"]).toBeDefined();
    expect(servers["chrome-devtools"]!.transport).toBe("stdio");
    expect(servers["chrome-devtools"]!.command).toBe("chrome-devtools-mcp");
    expect(servers["chrome-devtools"]!.toolMode).toBe("managed");
  });

  it("does not overwrite existing chrome-devtools entry from DB", async () => {
    mockListMcpServers.mockResolvedValue([
      {
        id: "chrome-devtools",
        name: "Custom Chrome",
        transport: "stdio",
        command: "my-chrome-mcp",
        enabled: true,
        args: null,
        connectTimeout: null,
        toolMode: "managed",
        availability: null,
        description: null,
      },
    ]);

    const servers = await loadMcpServersConfig();
    expect(servers["chrome-devtools"]!.command).toBe("my-chrome-mcp");
    expect(servers["chrome-devtools"]!.name).toBe("Custom Chrome");
  });
});
