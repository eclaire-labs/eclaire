/**
 * Shared Codex Item Decoder Tests
 *
 * Tests for the shared item-handling logic extracted from CodexCliDecoder.
 */

import { describe, expect, it } from "vitest";
import {
  type CodexAgentMessageItem,
  type CodexCommandExecutionItem,
  type CodexFileChangeItem,
  type CodexMcpToolCallItem,
  type CodexReasoningItem,
  decodeCodexItem,
} from "../cli/decoders/codex-items.js";

describe("decodeCodexItem", () => {
  describe("agent_message", () => {
    it("emits content_delta on completed phase with text", () => {
      const item: CodexAgentMessageItem = {
        type: "agent_message",
        id: "msg-1",
        text: "Hello world",
      };

      const result = decodeCodexItem(item, "completed");

      expect(result.events).toEqual([
        { type: "content_delta", text: "Hello world" },
      ]);
      expect(result.agentMessageText).toBe("Hello world");
    });

    it("returns empty on started phase", () => {
      const item: CodexAgentMessageItem = {
        type: "agent_message",
        id: "msg-1",
        text: "",
      };

      const result = decodeCodexItem(item, "started");
      expect(result.events).toEqual([]);
      expect(result.agentMessageText).toBeUndefined();
    });

    it("returns empty on completed with no text", () => {
      const item: CodexAgentMessageItem = {
        type: "agent_message",
        id: "msg-1",
        text: "",
      };

      const result = decodeCodexItem(item, "completed");
      expect(result.events).toEqual([]);
    });
  });

  describe("reasoning", () => {
    it("emits reasoning_delta with text", () => {
      const item: CodexReasoningItem = {
        type: "reasoning",
        id: "r-1",
        text: "Let me think about this...",
      };

      const result = decodeCodexItem(item, "started");

      expect(result.events).toEqual([
        { type: "reasoning_delta", text: "Let me think about this..." },
      ]);
    });

    it("returns empty with no text", () => {
      const item: CodexReasoningItem = {
        type: "reasoning",
        id: "r-1",
        text: "",
      };

      const result = decodeCodexItem(item, "started");
      expect(result.events).toEqual([]);
    });
  });

  describe("command_execution", () => {
    it("emits action on started phase", () => {
      const item: CodexCommandExecutionItem = {
        type: "command_execution",
        id: "cmd-1",
        command: "ls -la",
        aggregated_output: "",
        exit_code: null,
        status: "running",
      };

      const result = decodeCodexItem(item, "started");

      expect(result.events).toEqual([
        {
          type: "action",
          phase: "started",
          name: "ls -la",
          ok: undefined,
          detail: {
            id: "cmd-1",
            command: "ls -la",
            exit_code: null,
            status: "running",
          },
        },
      ]);
    });

    it("maps updated phase to started", () => {
      const item: CodexCommandExecutionItem = {
        type: "command_execution",
        id: "cmd-1",
        command: "npm test",
        aggregated_output: "running...",
        exit_code: null,
        status: "running",
      };

      const result = decodeCodexItem(item, "updated");
      expect(result.events[0]!.type).toBe("action");
      expect((result.events[0] as { phase: string }).phase).toBe("started");
    });

    it("emits completed action with ok status", () => {
      const item: CodexCommandExecutionItem = {
        type: "command_execution",
        id: "cmd-1",
        command: "echo hello",
        aggregated_output: "hello",
        exit_code: 0,
        status: "completed",
      };

      const result = decodeCodexItem(item, "completed");

      expect(result.events[0]).toMatchObject({
        type: "action",
        phase: "completed",
        ok: true,
      });
    });

    it("reports non-completed status as not ok", () => {
      const item: CodexCommandExecutionItem = {
        type: "command_execution",
        id: "cmd-1",
        command: "false",
        aggregated_output: "",
        exit_code: 1,
        status: "failed",
      };

      const result = decodeCodexItem(item, "completed");
      expect(result.events[0]).toMatchObject({
        type: "action",
        phase: "completed",
        ok: false,
      });
    });

    it("uses 'command' as fallback name", () => {
      const item: CodexCommandExecutionItem = {
        type: "command_execution",
        id: "cmd-1",
        command: "",
        aggregated_output: "",
        exit_code: null,
        status: "running",
      };

      const result = decodeCodexItem(item, "started");
      expect((result.events[0] as { name: string }).name).toBe("command");
    });
  });

  describe("file_change", () => {
    it("emits action only on completed phase", () => {
      const item: CodexFileChangeItem = {
        type: "file_change",
        id: "fc-1",
        changes: [
          { path: "src/index.ts", kind: "modified" },
          { path: "src/utils.ts", kind: "created" },
        ],
        status: "completed",
      };

      const resultStarted = decodeCodexItem(item, "started");
      expect(resultStarted.events).toEqual([]);

      const resultCompleted = decodeCodexItem(item, "completed");
      expect(resultCompleted.events).toEqual([
        {
          type: "action",
          phase: "completed",
          name: "file_change: modified: src/index.ts, created: src/utils.ts",
          ok: true,
          detail: {
            id: "fc-1",
            changes: [
              { path: "src/index.ts", kind: "modified" },
              { path: "src/utils.ts", kind: "created" },
            ],
            status: "completed",
          },
        },
      ]);
    });
  });

  describe("mcp_tool_call", () => {
    it("emits action event", () => {
      const item: CodexMcpToolCallItem = {
        type: "mcp_tool_call",
        id: "mcp-1",
        server: "github",
        tool: "search_code",
        arguments: { query: "test" },
        status: "completed",
      };

      const result = decodeCodexItem(item, "completed");

      expect(result.events).toEqual([
        {
          type: "action",
          phase: "completed",
          name: "github/search_code",
          ok: true,
          detail: {
            id: "mcp-1",
            server: "github",
            tool: "search_code",
            status: "completed",
          },
        },
      ]);
    });
  });

  describe("unknown item type", () => {
    it("returns empty events", () => {
      const item = { type: "unknown_thing", id: "x" };
      const result = decodeCodexItem(item, "completed");
      expect(result.events).toEqual([]);
    });
  });
});
