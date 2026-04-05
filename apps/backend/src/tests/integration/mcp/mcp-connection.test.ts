/**
 * MCP Connection Integration Tests
 *
 * Tests McpServerConnection talking to real in-process MCP servers via
 * InMemoryTransport. Uses _testTransport injection so all connection
 * lifecycle, tool discovery, and tool calling use real code and real JSON-RPC.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  createTestMcpServer,
  type TestMcpServer,
  McpServerConnection,
} from "@eclaire/ai";
import {
  createEchoServer,
  createFilterTestServer,
  createMultiContentServer,
} from "./helpers/create-in-process-server.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const servers: TestMcpServer[] = [];

/** Track servers for cleanup */
function track(server: TestMcpServer): TestMcpServer {
  servers.push(server);
  return server;
}

afterEach(async () => {
  for (const s of servers) {
    await s.close().catch(() => {});
  }
  servers.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("McpServerConnection - real MCP protocol", () => {
  // =========================================================================
  // Connection Lifecycle
  // =========================================================================

  describe("connection lifecycle", () => {
    it("connects to a real MCP server and transitions to connected state", async () => {
      const ts = track(await createEchoServer());
      const conn = new McpServerConnection(
        "test",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );

      expect(conn.getState()).toBe("disconnected");
      await conn.ensureConnected();
      expect(conn.getState()).toBe("connected");

      await conn.disconnect();
    });

    it("ensureConnected is idempotent", async () => {
      const ts = track(await createEchoServer());
      const conn = new McpServerConnection(
        "test",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );

      await conn.ensureConnected();
      await conn.ensureConnected();
      expect(conn.getState()).toBe("connected");

      await conn.disconnect();
    });

    it("disconnect transitions back to disconnected", async () => {
      const ts = track(await createEchoServer());
      const conn = new McpServerConnection(
        "test",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );

      await conn.ensureConnected();
      await conn.disconnect();
      expect(conn.getState()).toBe("disconnected");
    });
  });

  // =========================================================================
  // Tool Discovery
  // =========================================================================

  describe("tool discovery", () => {
    it("discoverTools returns all tools registered on the server", async () => {
      const ts = track(await createEchoServer());
      const conn = new McpServerConnection(
        "echo",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );

      const tools = await conn.discoverTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(["add", "echo", "fail_tool"]);

      await conn.disconnect();
    });

    it("discovered tools have correct name, description, and inputSchema", async () => {
      const ts = track(await createEchoServer());
      const conn = new McpServerConnection(
        "echo",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );

      const tools = await conn.discoverTools();
      const echoTool = tools.find((t) => t.name === "echo");

      expect(echoTool).toBeDefined();
      expect(echoTool!.description).toBe("Echoes the input message back");
      expect(echoTool!.serverKey).toBe("echo");
      expect(echoTool!.inputSchema).toHaveProperty("type", "object");

      await conn.disconnect();
    });

    it("allowedTools filters discovered tools to the allowlist", async () => {
      const ts = track(await createFilterTestServer());
      const conn = new McpServerConnection(
        "filter",
        {
          name: "Test",
          transport: "stdio",
          command: "x",
          allowedTools: ["alpha_read", "gamma_delete"],
        },
        ts.clientTransport,
      );

      const tools = await conn.discoverTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        "alpha_read",
        "gamma_delete",
      ]);

      await conn.disconnect();
    });

    it("blockedTools removes blocked tools from discovery results", async () => {
      const ts = track(await createFilterTestServer());
      const conn = new McpServerConnection(
        "filter",
        {
          name: "Test",
          transport: "stdio",
          command: "x",
          blockedTools: ["beta_write", "delta_list"],
        },
        ts.clientTransport,
      );

      const tools = await conn.discoverTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        "alpha_read",
        "epsilon_search",
        "gamma_delete",
      ]);

      await conn.disconnect();
    });

    it("allowedTools + blockedTools combine correctly", async () => {
      const ts = track(await createFilterTestServer());
      const conn = new McpServerConnection(
        "filter",
        {
          name: "Test",
          transport: "stdio",
          command: "x",
          allowedTools: ["alpha_read", "beta_write", "gamma_delete"],
          blockedTools: ["beta_write"],
        },
        ts.clientTransport,
      );

      const tools = await conn.discoverTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        "alpha_read",
        "gamma_delete",
      ]);

      await conn.disconnect();
    });

    it("discoverTools on server with no tools capability throws MCP error", async () => {
      // An MCP server that registers zero tools doesn't advertise tools capability,
      // so listTools returns "Method not found" — correct protocol behavior.
      const ts = track(await createTestMcpServer({ name: "empty", tools: [] }));
      const conn = new McpServerConnection(
        "empty",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );

      await expect(conn.discoverTools()).rejects.toThrow("Method not found");

      await conn.disconnect();
    });
  });

  // =========================================================================
  // Tool Calling
  // =========================================================================

  describe("tool calling", () => {
    it("callTool sends arguments and receives text result", async () => {
      const ts = track(await createEchoServer());
      const conn = new McpServerConnection(
        "echo",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );
      await conn.ensureConnected();

      const result = await conn.callTool("echo", { message: "hello world" });
      const r = result as { content: Array<{ type: string; text: string }> };

      expect(r.content).toHaveLength(1);
      expect(r.content[0]).toEqual({ type: "text", text: "hello world" });

      await conn.disconnect();
    });

    it("callTool with numeric arguments", async () => {
      const ts = track(await createEchoServer());
      const conn = new McpServerConnection(
        "echo",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );
      await conn.ensureConnected();

      const result = await conn.callTool("add", { a: 3, b: 7 });
      const r = result as { content: Array<{ type: string; text: string }> };
      expect(r.content[0]!.text).toBe("10");

      await conn.disconnect();
    });

    it("callTool handles isError responses", async () => {
      const ts = track(await createEchoServer());
      const conn = new McpServerConnection(
        "echo",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );
      await conn.ensureConnected();

      const result = await conn.callTool("fail_tool");
      const r = result as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };

      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toBe("Something went wrong");

      await conn.disconnect();
    });

    it("callTool passes _meta to the server", async () => {
      const ts = track(await createEchoServer());
      const conn = new McpServerConnection(
        "echo",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );
      await conn.ensureConnected();

      const result = await conn.callTool(
        "echo",
        { message: "with-meta" },
        { userId: "user-123" },
      );
      const r = result as { content: Array<{ type: string; text: string }> };
      expect(r.content[0]!.text).toBe("with-meta");

      await conn.disconnect();
    });

    it("callTool handles multi-content responses", async () => {
      const ts = track(await createMultiContentServer());
      const conn = new McpServerConnection(
        "multi",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );
      await conn.ensureConnected();

      const result = await conn.callTool("get_chart");
      const r = result as {
        content: Array<{
          type: string;
          text?: string;
          data?: string;
          mimeType?: string;
        }>;
      };

      expect(r.content).toHaveLength(2);
      expect(r.content[0]).toEqual({
        type: "text",
        text: "Chart summary: sales are up 15%",
      });
      expect(r.content[1]).toMatchObject({
        type: "image",
        data: "iVBORw0KGgo=",
        mimeType: "image/png",
      });

      await conn.disconnect();
    });
  });

  // =========================================================================
  // End-to-End Flow
  // =========================================================================

  describe("end-to-end flow", () => {
    it("connect -> discover -> call each tool -> disconnect", async () => {
      const ts = track(await createEchoServer());
      const conn = new McpServerConnection(
        "e2e",
        { name: "Test", transport: "stdio", command: "x" },
        ts.clientTransport,
      );

      await conn.ensureConnected();
      expect(conn.getState()).toBe("connected");

      const tools = await conn.discoverTools();
      expect(tools.length).toBe(3);

      const echoResult = (await conn.callTool("echo", {
        message: "test",
      })) as any;
      expect(echoResult.content[0].text).toBe("test");

      const addResult = (await conn.callTool("add", { a: 1, b: 2 })) as any;
      expect(addResult.content[0].text).toBe("3");

      const failResult = (await conn.callTool("fail_tool")) as any;
      expect(failResult.isError).toBe(true);

      await conn.disconnect();
      expect(conn.getState()).toBe("disconnected");
    });
  });
});
