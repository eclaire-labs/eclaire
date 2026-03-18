/**
 * Manage Admin Tool
 *
 * Compound admin tool for managing AI providers, models, MCP servers,
 * model selection, and instance settings. Admin-only.
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
  createProvider,
  updateProvider,
  deleteProvider,
  listModels,
  getModel,
  createModel,
  updateModel,
  deleteModel,
  listMcpServers,
  getMcpServer,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  getAllSelections,
  setActiveModelForContext,
} from "../../services/ai-config.js";
import {
  getAllInstanceSettings,
  setInstanceSettings,
} from "../../services/instance-settings.js";

const inputSchema = z.object({
  action: z
    .enum([
      "listProviders",
      "getProvider",
      "createProvider",
      "updateProvider",
      "deleteProvider",
      "listModels",
      "getModel",
      "createModel",
      "updateModel",
      "deleteModel",
      "listMcpServers",
      "getMcpServer",
      "createMcpServer",
      "updateMcpServer",
      "deleteMcpServer",
      "getModelSelection",
      "setModelSelection",
      "getInstanceSettings",
      "updateInstanceSettings",
    ])
    .describe("The admin operation to perform"),
  id: z
    .string()
    .optional()
    .describe("Entity ID for get/update/delete operations"),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Configuration payload for create/update operations"),
  context: z
    .string()
    .optional()
    .describe("Model selection context key (e.g., 'backend', 'workers')"),
});

export const manageAdminTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "manageAdmin",
  label: "Manage Admin",
  description:
    "Perform admin operations: manage AI providers, models, MCP servers, model selection, and instance settings. Requires instance admin role.",
  inputSchema,
  promptGuidelines: [
    "Only perform admin operations when the user explicitly requests them.",
    "Always show the current state before making changes.",
  ],
  needsApproval: (input) =>
    ["deleteProvider", "deleteModel", "deleteMcpServer"].includes(input.action),
  execute: async (_callId, input, ctx) => {
    // Defense-in-depth: verify admin status even if tool filtering missed it
    try {
      await assertInstanceAdmin(ctx.userId);
    } catch {
      return errorResult(
        "This operation requires instance administrator privileges.",
      );
    }

    try {
      switch (input.action) {
        // Providers
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
        case "createProvider": {
          if (!input.id)
            return errorResult("'id' is required for createProvider");
          if (!input.data)
            return errorResult("'data' is required for createProvider");
          await createProvider(
            input.id,
            input.data as unknown as Parameters<typeof createProvider>[1],
            ctx.userId,
          );
          return textResult(`Provider "${input.id}" created successfully.`);
        }
        case "updateProvider": {
          if (!input.id)
            return errorResult("'id' is required for updateProvider");
          if (!input.data)
            return errorResult("'data' is required for updateProvider");
          await updateProvider(
            input.id,
            input.data as unknown as Parameters<typeof updateProvider>[1],
            ctx.userId,
          );
          return textResult(`Provider "${input.id}" updated successfully.`);
        }
        case "deleteProvider": {
          if (!input.id)
            return errorResult("'id' is required for deleteProvider");
          await deleteProvider(input.id);
          return textResult(`Provider "${input.id}" deleted successfully.`);
        }

        // Models
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
        case "createModel": {
          if (!input.id) return errorResult("'id' is required for createModel");
          if (!input.data)
            return errorResult("'data' is required for createModel");
          await createModel(
            input.id,
            input.data as unknown as Parameters<typeof createModel>[1],
            ctx.userId,
          );
          return textResult(`Model "${input.id}" created successfully.`);
        }
        case "updateModel": {
          if (!input.id) return errorResult("'id' is required for updateModel");
          if (!input.data)
            return errorResult("'data' is required for updateModel");
          await updateModel(
            input.id,
            input.data as unknown as Parameters<typeof updateModel>[1],
            ctx.userId,
          );
          return textResult(`Model "${input.id}" updated successfully.`);
        }
        case "deleteModel": {
          if (!input.id) return errorResult("'id' is required for deleteModel");
          await deleteModel(input.id);
          return textResult(`Model "${input.id}" deleted successfully.`);
        }

        // MCP Servers
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
        case "createMcpServer": {
          if (!input.id)
            return errorResult("'id' is required for createMcpServer");
          if (!input.data)
            return errorResult("'data' is required for createMcpServer");
          await createMcpServer(
            input.id,
            input.data as unknown as Parameters<typeof createMcpServer>[1],
            ctx.userId,
          );
          return textResult(`MCP server "${input.id}" created successfully.`);
        }
        case "updateMcpServer": {
          if (!input.id)
            return errorResult("'id' is required for updateMcpServer");
          if (!input.data)
            return errorResult("'data' is required for updateMcpServer");
          await updateMcpServer(
            input.id,
            input.data as unknown as Parameters<typeof updateMcpServer>[1],
            ctx.userId,
          );
          return textResult(`MCP server "${input.id}" updated successfully.`);
        }
        case "deleteMcpServer": {
          if (!input.id)
            return errorResult("'id' is required for deleteMcpServer");
          await deleteMcpServer(input.id);
          return textResult(`MCP server "${input.id}" deleted successfully.`);
        }

        // Model Selection
        case "getModelSelection": {
          const selections = await getAllSelections();
          return textResult(JSON.stringify(selections, null, 2));
        }
        case "setModelSelection": {
          if (!input.context)
            return errorResult("'context' is required for setModelSelection");
          const modelId =
            input.data?.modelId ?? input.data?.model_id ?? input.id;
          if (typeof modelId !== "string")
            return errorResult(
              "'data.modelId' (string) is required for setModelSelection",
            );
          await setActiveModelForContext(input.context, modelId, ctx.userId);
          return textResult(
            `Model selection for context "${input.context}" set to "${modelId}".`,
          );
        }

        // Instance Settings
        case "getInstanceSettings": {
          const settings = await getAllInstanceSettings();
          return textResult(JSON.stringify(settings, null, 2));
        }
        case "updateInstanceSettings": {
          if (!input.data)
            return errorResult("'data' is required for updateInstanceSettings");
          await setInstanceSettings(input.data, ctx.userId);
          return textResult("Instance settings updated successfully.");
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
