/**
 * JSON-RPC Transport Tests
 *
 * Tests for JsonRpcTransport: request/response correlation,
 * notification dispatch, and error handling.
 */

import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonRpcTransport } from "../cli/appserver/jsonrpc.js";
import { createMockLoggerFactory } from "./setup.js";

// Mock the logger module
vi.mock("../../logger.js", () => ({
  createAILogger: () => createMockLoggerFactory().factory("jsonrpc"),
  createLazyLogger: () => () => createMockLoggerFactory().factory("jsonrpc"),
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error ?? "Unknown error"),
}));

// =============================================================================
// MOCK CHILD PROCESS
// =============================================================================

function createMockProcess(): {
  proc: ChildProcess;
  stdout: PassThrough;
  stdin: PassThrough;
  emitter: EventEmitter;
} {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const emitter = new EventEmitter();

  const proc = {
    stdin,
    stdout,
    stderr: new PassThrough(),
    exitCode: null,
    killed: false,
    pid: 12345,
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    emit: emitter.emit.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    kill: vi.fn(),
  } as unknown as ChildProcess;

  return { proc, stdout, stdin, emitter };
}

function captureStdinWrites(stdin: PassThrough): string[] {
  const writes: string[] = [];
  stdin.on("data", (chunk: Buffer) => {
    writes.push(chunk.toString());
  });
  return writes;
}

// =============================================================================
// TESTS
// =============================================================================

describe("JsonRpcTransport", () => {
  let mockProc: ReturnType<typeof createMockProcess>;
  let transport: JsonRpcTransport;
  let stdinWrites: string[];

  beforeEach(() => {
    mockProc = createMockProcess();
    transport = new JsonRpcTransport(mockProc.proc, 5000);
    stdinWrites = captureStdinWrites(mockProc.stdin);
  });

  afterEach(() => {
    transport.close();
  });

  describe("sendRequest", () => {
    it("sends JSON-RPC request and resolves on matching response", async () => {
      const promise = transport.sendRequest("initialize", {
        clientInfo: { name: "test" },
      });

      // Wait for write to propagate
      await new Promise((r) => setTimeout(r, 10));

      // Verify the request was sent
      expect(stdinWrites.length).toBeGreaterThan(0);
      const sent = JSON.parse(stdinWrites[0]!.trim());
      expect(sent).toMatchObject({
        jsonrpc: "2.0",
        method: "initialize",
        params: { clientInfo: { name: "test" } },
      });
      expect(sent.id).toBeTypeOf("number");

      // Send matching response
      mockProc.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: sent.id, result: { serverInfo: { name: "codex" } } })}\n`,
      );

      const result = await promise;
      expect(result).toEqual({ serverInfo: { name: "codex" } });
    });

    it("rejects on JSON-RPC error response", async () => {
      const promise = transport.sendRequest("bad/method");

      await new Promise((r) => setTimeout(r, 10));
      const sent = JSON.parse(stdinWrites[0]!.trim());

      mockProc.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: sent.id,
          error: { code: -32601, message: "Method not found" },
        })}\n`,
      );

      await expect(promise).rejects.toThrow("Method not found");
    });

    it("rejects on timeout", async () => {
      // Create transport with very short timeout
      const fastTransport = new JsonRpcTransport(mockProc.proc, 50);
      const promise = fastTransport.sendRequest("slow/method");

      await expect(promise).rejects.toThrow("timed out");
      fastTransport.close();
    });

    it("rejects when transport is closed", () => {
      transport.close();
      expect(() => transport.sendRequest("method")).rejects.toThrow(
        "Transport is closed",
      );
    });
  });

  describe("sendNotification", () => {
    it("sends notification without id", () => {
      transport.sendNotification("initialized");

      const sent = JSON.parse(stdinWrites[0]!.trim());
      expect(sent).toMatchObject({
        jsonrpc: "2.0",
        method: "initialized",
      });
      expect(sent.id).toBeUndefined();
    });

    it("throws when transport is closed", () => {
      transport.close();
      expect(() => transport.sendNotification("method")).toThrow(
        "Transport is closed",
      );
    });
  });

  describe("sendResponse", () => {
    it("sends response with id and result", () => {
      transport.sendResponse(42, { approved: true });

      const sent = JSON.parse(stdinWrites[0]!.trim());
      expect(sent).toEqual({
        jsonrpc: "2.0",
        id: 42,
        result: { approved: true },
      });
    });
  });

  describe("notification handling", () => {
    it("dispatches notifications to handler", async () => {
      const received: Array<{
        method: string;
        params: Record<string, unknown>;
      }> = [];

      transport.setNotificationHandler((method, params) => {
        received.push({ method, params });
      });

      // Send a notification (no id field)
      mockProc.stdout.write(
        `${JSON.stringify({ method: "item/agentMessage/delta", params: { threadId: "t-1", delta: "Hi" } })}\n`,
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(received).toEqual([
        {
          method: "item/agentMessage/delta",
          params: { threadId: "t-1", delta: "Hi" },
        },
      ]);
    });
  });

  describe("server request handling", () => {
    it("dispatches server-initiated requests to handler", async () => {
      const received: Array<{
        method: string;
        params: Record<string, unknown>;
        id: number;
      }> = [];

      transport.setServerRequestHandler((method, params, id) => {
        received.push({ method, params, id });
      });

      // Send a server-initiated request (has both id and method)
      mockProc.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 99,
          method: "approval/requested",
          params: { itemId: "cmd-1", type: "command" },
        })}\n`,
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(received).toEqual([
        {
          method: "approval/requested",
          params: { itemId: "cmd-1", type: "command" },
          id: 99,
        },
      ]);
    });
  });

  describe("line buffering", () => {
    it("handles partial lines across chunks", async () => {
      const received: Array<{ method: string }> = [];

      transport.setNotificationHandler((method) => {
        received.push({ method });
      });

      // Send in two chunks
      const full = JSON.stringify({
        method: "turn/completed",
        params: { threadId: "t-1" },
      });
      const half = Math.floor(full.length / 2);

      mockProc.stdout.write(full.slice(0, half));
      await new Promise((r) => setTimeout(r, 10));
      expect(received).toEqual([]);

      mockProc.stdout.write(`${full.slice(half)}\n`);
      await new Promise((r) => setTimeout(r, 10));
      expect(received).toEqual([{ method: "turn/completed" }]);
    });

    it("handles multiple messages in one chunk", async () => {
      const received: string[] = [];

      transport.setNotificationHandler((method) => {
        received.push(method);
      });

      const msg1 = JSON.stringify({ method: "item/started", params: {} });
      const msg2 = JSON.stringify({ method: "item/completed", params: {} });

      mockProc.stdout.write(`${msg1}\n${msg2}\n`);
      await new Promise((r) => setTimeout(r, 10));

      expect(received).toEqual(["item/started", "item/completed"]);
    });
  });

  describe("process exit handling", () => {
    it("rejects pending requests on process exit", async () => {
      const promise = transport.sendRequest("initialize");

      // Simulate process exit
      mockProc.emitter.emit("exit", 1, null);

      await expect(promise).rejects.toThrow("exited with code 1");
    });

    it("marks transport as closed on process exit", () => {
      mockProc.emitter.emit("exit", 0, null);
      expect(transport.isClosed).toBe(true);
    });
  });

  describe("close", () => {
    it("rejects all pending requests", async () => {
      const p1 = transport.sendRequest("method1");
      const p2 = transport.sendRequest("method2");

      transport.close();

      await expect(p1).rejects.toThrow("Transport closed");
      await expect(p2).rejects.toThrow("Transport closed");
    });

    it("is idempotent", () => {
      transport.close();
      transport.close();
      expect(transport.isClosed).toBe(true);
    });
  });
});
