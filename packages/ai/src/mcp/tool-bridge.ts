/**
 * MCP Tool Bridge
 *
 * Converts MCP tool descriptors into RuntimeToolDefinitions that the
 * agent system can use.
 */

import { z } from "zod";
import type {
  RuntimeToolDefinition,
  RuntimeToolResult,
} from "../runtime/tools/types.js";
import type { McpServerConnection } from "./connection.js";
import type { McpServerConfig, McpToolDescriptor } from "./types.js";

/**
 * Passthrough Zod schema for MCP tool inputs.
 * MCP servers handle their own input validation, so we accept any object.
 */
const mcpPassthroughSchema = z.record(z.string(), z.any());

// =============================================================================
// RESULT NORMALIZATION
// =============================================================================

/**
 * Normalize an MCP callTool result into a RuntimeToolResult.
 */
export function normalizeMcpResult(
  result: unknown,
  serverKey: string,
): RuntimeToolResult {
  if (!result || typeof result !== "object") {
    return {
      content: [{ type: "text", text: String(result ?? "") }],
      details: { mcpServer: serverKey },
    };
  }

  const r = result as {
    content?: Array<{
      type?: string;
      text?: string;
      data?: string;
      mimeType?: string;
    }>;
    isError?: boolean;
  };

  const contentBlocks: RuntimeToolResult["content"] = [];

  if (Array.isArray(r.content)) {
    for (const item of r.content) {
      if (item?.type === "text" && typeof item.text === "string") {
        contentBlocks.push({ type: "text", text: item.text });
      } else if (
        item?.type === "image" &&
        typeof item.data === "string" &&
        typeof item.mimeType === "string"
      ) {
        contentBlocks.push({
          type: "image",
          data: item.data,
          mimeType: item.mimeType,
        });
      }
    }
  }

  if (contentBlocks.length === 0) {
    // Fallback: serialize the whole result as text
    try {
      contentBlocks.push({ type: "text", text: JSON.stringify(result) });
    } catch {
      contentBlocks.push({ type: "text", text: String(result) });
    }
  }

  return {
    content: contentBlocks,
    details: { mcpServer: serverKey },
    isError: r.isError === true,
  };
}

// =============================================================================
// INDIVIDUAL MODE
// =============================================================================

/**
 * Build the prefixed tool name for an MCP tool.
 */
function buildToolName(
  mcpToolName: string,
  prefix: string | undefined,
): string {
  return prefix ? `${prefix}_${mcpToolName}` : mcpToolName;
}

/**
 * Convert a single MCP tool descriptor into a RuntimeToolDefinition.
 * Used for `toolMode: "individual"`.
 */
export function mcpToolToRuntimeTool(
  descriptor: McpToolDescriptor,
  connection: McpServerConnection,
  serverConfig: McpServerConfig,
): RuntimeToolDefinition {
  const toolName = buildToolName(descriptor.name, serverConfig.toolPrefix);

  return {
    name: toolName,
    label: descriptor.name,
    description: descriptor.description ?? `MCP tool: ${descriptor.name}`,
    inputSchema: mcpPassthroughSchema,
    __rawJsonSchema: descriptor.inputSchema,
    promptSnippet: serverConfig.promptSnippet,
    promptGuidelines: serverConfig.promptGuidelines,

    execute: async (_callId, input, ctx) => {
      try {
        const result = await connection.callTool(
          descriptor.name,
          input as Record<string, unknown>,
          { userId: ctx.userId },
        );
        return normalizeMcpResult(result, descriptor.serverKey);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text:
                error instanceof Error
                  ? error.message
                  : `MCP tool "${descriptor.name}" failed`,
            },
          ],
          details: { mcpServer: descriptor.serverKey },
          isError: true,
        };
      }
    },
  };
}

// =============================================================================
// GROUPED MODE
// =============================================================================

/**
 * Convert multiple MCP tool descriptors into a single grouped RuntimeToolDefinition.
 * Used for `toolMode: "grouped"` — similar to how browseChrome works with an action enum.
 */
export function mcpToolsToGroupedRuntimeTool(
  descriptors: McpToolDescriptor[],
  connection: McpServerConnection,
  serverConfig: McpServerConfig,
): RuntimeToolDefinition {
  const toolName = serverConfig.groupedToolName ?? serverConfig.name;
  const actionNames = descriptors.map((d) => d.name);

  const groupedJsonSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: actionNames,
        description: "The action to perform.",
      },
      args: {
        type: "object",
        description: "Arguments for the action. See individual action schemas.",
        additionalProperties: true,
      },
    },
    required: ["action"],
  };

  const actionDescriptions = descriptors
    .map((d) => `- ${d.name}: ${d.description ?? "(no description)"}`)
    .join("\n");

  return {
    name: toolName,
    label: serverConfig.name,
    description: `${serverConfig.description ?? serverConfig.name}\n\nAvailable actions:\n${actionDescriptions}`,
    inputSchema: mcpPassthroughSchema,
    __rawJsonSchema: groupedJsonSchema,
    promptSnippet: serverConfig.promptSnippet,
    promptGuidelines: serverConfig.promptGuidelines,

    execute: async (_callId, input, ctx) => {
      const { action, args = {} } = input as {
        action: string;
        args?: Record<string, unknown>;
      };

      if (!action || !actionNames.includes(action)) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown action "${action}". Available: ${actionNames.join(", ")}`,
            },
          ],
          details: { mcpServer: serverConfig.name },
          isError: true,
        };
      }

      try {
        const result = await connection.callTool(
          action,
          args as Record<string, unknown>,
          { userId: ctx.userId },
        );
        return normalizeMcpResult(result, connection.getServerKey());
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text:
                error instanceof Error
                  ? error.message
                  : `MCP action "${action}" failed`,
            },
          ],
          details: { mcpServer: connection.getServerKey() },
          isError: true,
        };
      }
    },
  };
}
