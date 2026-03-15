/**
 * Codex App-Server Decoder Tests
 *
 * Tests for decodeAppServerNotification() which converts JSON-RPC
 * notifications from the app-server into unified CliEvents.
 */

import { describe, expect, it } from "vitest";
import { decodeAppServerNotification } from "../cli/appserver/decoder.js";

describe("decodeAppServerNotification", () => {
  describe("item/agentMessage/delta", () => {
    it("emits content_delta", () => {
      const events = decodeAppServerNotification("item/agentMessage/delta", {
        threadId: "t-1",
        itemId: "item-1",
        delta: "Hello ",
      });

      expect(events).toEqual([{ type: "content_delta", text: "Hello " }]);
    });

    it("returns empty for missing delta", () => {
      const events = decodeAppServerNotification("item/agentMessage/delta", {
        threadId: "t-1",
        itemId: "item-1",
      });

      expect(events).toEqual([]);
    });

    it("returns empty for empty delta", () => {
      const events = decodeAppServerNotification("item/agentMessage/delta", {
        threadId: "t-1",
        itemId: "item-1",
        delta: "",
      });

      expect(events).toEqual([]);
    });
  });

  describe("item/reasoning/delta", () => {
    it("emits reasoning_delta", () => {
      const events = decodeAppServerNotification("item/reasoning/delta", {
        threadId: "t-1",
        itemId: "item-1",
        delta: "Let me think...",
      });

      expect(events).toEqual([
        { type: "reasoning_delta", text: "Let me think..." },
      ]);
    });
  });

  describe("item/started", () => {
    it("emits action started for command_execution", () => {
      const events = decodeAppServerNotification("item/started", {
        threadId: "t-1",
        item: {
          id: "cmd-1",
          type: "command_execution",
          command: "npm test",
          aggregated_output: "",
          exit_code: null,
          status: "running",
        },
      });

      expect(events).toEqual([
        expect.objectContaining({
          type: "action",
          phase: "started",
          name: "npm test",
        }),
      ]);
    });

    it("returns empty for agent_message started", () => {
      const events = decodeAppServerNotification("item/started", {
        threadId: "t-1",
        item: {
          id: "msg-1",
          type: "agent_message",
          text: "",
        },
      });

      expect(events).toEqual([]);
    });
  });

  describe("item/completed", () => {
    it("emits content_delta for completed agent_message", () => {
      const events = decodeAppServerNotification("item/completed", {
        threadId: "t-1",
        item: {
          id: "msg-1",
          type: "agent_message",
          text: "The answer is 42.",
        },
      });

      expect(events).toEqual([
        { type: "content_delta", text: "The answer is 42." },
      ]);
    });

    it("emits action completed for command_execution", () => {
      const events = decodeAppServerNotification("item/completed", {
        threadId: "t-1",
        item: {
          id: "cmd-1",
          type: "command_execution",
          command: "echo hello",
          aggregated_output: "hello",
          exit_code: 0,
          status: "completed",
        },
      });

      expect(events).toEqual([
        expect.objectContaining({
          type: "action",
          phase: "completed",
          name: "echo hello",
          ok: true,
        }),
      ]);
    });

    it("emits action completed for file_change", () => {
      const events = decodeAppServerNotification("item/completed", {
        threadId: "t-1",
        item: {
          id: "fc-1",
          type: "file_change",
          changes: [{ path: "src/app.ts", kind: "modified" }],
          status: "completed",
        },
      });

      expect(events).toEqual([
        expect.objectContaining({
          type: "action",
          phase: "completed",
          name: "file_change: modified: src/app.ts",
          ok: true,
        }),
      ]);
    });

    it("emits action completed for mcp_tool_call", () => {
      const events = decodeAppServerNotification("item/completed", {
        threadId: "t-1",
        item: {
          id: "mcp-1",
          type: "mcp_tool_call",
          server: "github",
          tool: "create_issue",
          arguments: {},
          status: "completed",
        },
      });

      expect(events).toEqual([
        expect.objectContaining({
          type: "action",
          phase: "completed",
          name: "github/create_issue",
          ok: true,
        }),
      ]);
    });
  });

  describe("turn/completed", () => {
    it("emits usage and completed events", () => {
      const events = decodeAppServerNotification("turn/completed", {
        threadId: "t-1",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      });

      expect(events).toEqual([
        {
          type: "usage",
          inputTokens: 100,
          outputTokens: 50,
        },
        {
          type: "completed",
          answer: "",
          sessionId: "t-1",
          ok: true,
        },
      ]);
    });

    it("emits completed without usage if missing", () => {
      const events = decodeAppServerNotification("turn/completed", {
        threadId: "t-1",
      });

      expect(events).toEqual([
        {
          type: "completed",
          answer: "",
          sessionId: "t-1",
          ok: true,
        },
      ]);
    });
  });

  describe("turn/failed", () => {
    it("emits completed (not ok) and error", () => {
      const events = decodeAppServerNotification("turn/failed", {
        threadId: "t-1",
        error: { message: "Model overloaded" },
      });

      expect(events).toEqual([
        {
          type: "completed",
          answer: "",
          sessionId: "t-1",
          ok: false,
        },
        {
          type: "error",
          message: "Model overloaded",
        },
      ]);
    });

    it("uses fallback error message", () => {
      const events = decodeAppServerNotification("turn/failed", {
        threadId: "t-1",
        error: {},
      });

      expect(events[1]).toMatchObject({
        type: "error",
        message: "Turn failed",
      });
    });
  });

  describe("unknown method", () => {
    it("returns empty events", () => {
      const events = decodeAppServerNotification("some/unknown/method", {
        data: "whatever",
      });

      expect(events).toEqual([]);
    });
  });
});
