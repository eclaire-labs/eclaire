/**
 * Manage Admin Read Tool
 *
 * Read-only admin operations: list/get providers, models, MCP servers,
 * model selection, instance settings, users, and provider presets.
 * Admin-only.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { assertInstanceAdmin } from "../../auth-utils.js";
import {
  listProviders,
  getProvider,
  listModels,
  getModel,
  listMcpServers,
  getMcpServer,
  testProviderConnection,
  getAllSelections,
} from "../../services/ai-config.js";
import {
  fetchProviderCatalog,
  inspectImportUrl,
} from "../../services/ai-import.js";
import { listProviderPresets } from "../../services/ai-provider-presets.js";
import { listUsersAdminExtended } from "../../services/admin-lifecycle.js";
import { getAllInstanceSettings } from "../../services/instance-settings.js";

const inputSchema = z.object({
  action: z
    .enum([
      "listProviders",
      "getProvider",
      "listProviderPresets",
      "fetchProviderCatalog",
      "testProvider",
      "listModels",
      "getModel",
      "inspectImportUrl",
      "listMcpServers",
      "getMcpServer",
      "getModelSelection",
      "getInstanceSettings",
      "listUsers",
    ])
    .describe("The read-only admin operation to perform"),
  id: z.string().optional().describe("Entity ID for get operations"),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Payload for operations that require additional arguments"),
});

export const manageAdminReadTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "manageAdminRead",
  label: "View Admin Config",
  description:
    "Read admin configuration: list/get AI providers, models, MCP servers, model selection, instance settings, users, and provider presets. Requires instance admin role.",
  accessLevel: "read",
  inputSchema,
  promptGuidelines: [
    "Use this tool to inspect admin configuration before making changes.",
  ],
  execute: async (_callId, input, ctx) => {
    // Defense-in-depth: verify admin status
    try {
      await assertInstanceAdmin(ctx.userId);
    } catch {
      return errorResult(
        "This operation requires instance administrator privileges.",
      );
    }

    // Defense-in-depth: verify caller has admin:read scope if using API key
    const callerScopes = ctx.extra?.callerScopes as string[] | undefined;
    if (
      callerScopes &&
      !callerScopes.includes("*") &&
      !callerScopes.includes("admin:read") &&
      !callerScopes.includes("admin:write")
    ) {
      return errorResult(
        "API key does not have admin:read scope for this operation.",
      );
    }

    try {
      switch (input.action) {
        case "listProviders": {
          const providers = await listProviders();
          return textResult(JSON.stringify(providers, null, 2));
        }
        case "getProvider": {
          if (!input.id) return errorResult("'id' is required for getProvider");
          const provider = await getProvider(input.id);
          if (!provider) return errorResult(`Provider "${input.id}" not found`);
          return textResult(JSON.stringify(provider, null, 2));
        }
        case "listModels": {
          const models = await listModels();
          return textResult(JSON.stringify(models, null, 2));
        }
        case "getModel": {
          if (!input.id) return errorResult("'id' is required for getModel");
          const model = await getModel(input.id);
          if (!model) return errorResult(`Model "${input.id}" not found`);
          return textResult(JSON.stringify(model, null, 2));
        }
        case "listMcpServers": {
          const servers = await listMcpServers();
          return textResult(JSON.stringify(servers, null, 2));
        }
        case "getMcpServer": {
          if (!input.id)
            return errorResult("'id' is required for getMcpServer");
          const server = await getMcpServer(input.id);
          if (!server) return errorResult(`MCP server "${input.id}" not found`);
          return textResult(JSON.stringify(server, null, 2));
        }
        case "getModelSelection": {
          const selections = await getAllSelections();
          return textResult(JSON.stringify(selections, null, 2));
        }
        case "getInstanceSettings": {
          const settings = await getAllInstanceSettings();
          return textResult(JSON.stringify(settings, null, 2));
        }
        case "listUsers": {
          const users = await listUsersAdminExtended();
          return textResult(JSON.stringify(users, null, 2));
        }
        case "testProvider": {
          if (!input.id)
            return errorResult(
              "'id' is required for testProvider (provider ID)",
            );
          const testResult = await testProviderConnection(input.id);
          return textResult(JSON.stringify(testResult, null, 2));
        }
        case "listProviderPresets": {
          const presets = listProviderPresets();
          return textResult(JSON.stringify(presets, null, 2));
        }
        case "fetchProviderCatalog": {
          if (!input.id)
            return errorResult(
              "'id' is required for fetchProviderCatalog (provider ID)",
            );
          const provider = await getProvider(input.id);
          if (!provider) return errorResult(`Provider "${input.id}" not found`);
          const catalog = await fetchProviderCatalog(provider);
          return textResult(JSON.stringify(catalog, null, 2));
        }
        case "inspectImportUrl": {
          const url = input.data?.url;
          if (typeof url !== "string")
            return errorResult(
              "'data.url' (string) is required for inspectImportUrl",
            );
          const inspection = await inspectImportUrl(url);
          return textResult(JSON.stringify(inspection, null, 2));
        }
        default:
          return errorResult(`Unknown action: ${input.action}`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      return errorResult(message);
    }
  },
};
