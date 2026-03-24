/**
 * Manage Admin Tool
 *
 * Compound admin tool for managing AI providers, models, MCP servers,
 * model selection, instance settings, users, provider presets, and model imports.
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
  createProvider,
  updateProvider,
  deleteProvider,
  listModels,
  getModel,
  createModel,
  updateModel,
  deleteModel,
  importModels,
  testProviderConnection,
  listMcpServers,
  getMcpServer,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  getAllSelections,
  setActiveModelForContext,
} from "../../services/ai-config.js";
import {
  fetchProviderCatalog,
  inspectImportUrl,
} from "../../services/ai-import.js";
import { listProviderPresets } from "../../services/ai-provider-presets.js";
import { setUserRole } from "../../services/admin.js";
import {
  createUserByAdmin,
  deleteUserByAdmin,
  listUsersAdminExtended,
  reactivateUser,
  revokeAllUserApiKeys,
  revokeAllUserSessions,
  suspendUser,
} from "../../services/admin-lifecycle.js";
import {
  getAllInstanceSettings,
  setInstanceSettings,
} from "../../services/instance-settings.js";

const inputSchema = z.object({
  action: z
    .enum([
      // Providers
      "listProviders",
      "getProvider",
      "createProvider",
      "updateProvider",
      "deleteProvider",
      "listProviderPresets",
      "fetchProviderCatalog",
      "testProvider",
      // Models
      "listModels",
      "getModel",
      "createModel",
      "updateModel",
      "deleteModel",
      "inspectImportUrl",
      "importModels",
      // MCP Servers
      "listMcpServers",
      "getMcpServer",
      "createMcpServer",
      "updateMcpServer",
      "deleteMcpServer",
      // Model Selection & Settings
      "getModelSelection",
      "setModelSelection",
      "getInstanceSettings",
      "updateInstanceSettings",
      // User Management
      "listUsers",
      "createUser",
      "setUserRole",
      "suspendUser",
      "reactivateUser",
      "revokeUserSessions",
      "revokeUserApiKeys",
      "deleteUser",
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
    "Perform admin operations: manage AI providers, models, MCP servers, model selection, instance settings, users, provider presets, and model imports. Requires instance admin role.",
  inputSchema,
  promptGuidelines: [
    "Only perform admin operations when the user explicitly requests them.",
    "Always show the current state before making changes.",
  ],
  needsApproval: (input) => {
    const readOnlyActions = new Set([
      "listProviders",
      "getProvider",
      "listModels",
      "getModel",
      "listMcpServers",
      "getMcpServer",
      "getModelSelection",
      "getInstanceSettings",
      "listUsers",
      "listProviderPresets",
      "fetchProviderCatalog",
      "testProvider",
      "inspectImportUrl",
    ]);
    return !readOnlyActions.has(input.action);
  },
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

        // Users
        case "listUsers": {
          const users = await listUsersAdminExtended();
          return textResult(JSON.stringify(users, null, 2));
        }
        case "createUser": {
          if (!input.data?.email || !input.data?.password)
            return errorResult(
              "'data.email' and 'data.password' are required for createUser",
            );
          const newUser = await createUserByAdmin(
            input.data.email as string,
            input.data.password as string,
            (input.data.displayName as string | null) ?? null,
            ctx.userId,
          );
          return textResult(JSON.stringify(newUser, null, 2));
        }
        case "setUserRole": {
          if (!input.id) return errorResult("'id' is required for setUserRole");
          if (input.data?.isAdmin === undefined)
            return errorResult(
              "'data.isAdmin' (boolean) is required for setUserRole",
            );
          await setUserRole(
            input.id,
            input.data.isAdmin as boolean,
            ctx.userId,
          );
          return textResult(
            `User "${input.id}" role updated (admin=${input.data.isAdmin}).`,
          );
        }
        case "suspendUser": {
          if (!input.id) return errorResult("'id' is required for suspendUser");
          await suspendUser(input.id, ctx.userId);
          return textResult(`User "${input.id}" suspended.`);
        }
        case "reactivateUser": {
          if (!input.id)
            return errorResult("'id' is required for reactivateUser");
          await reactivateUser(input.id, ctx.userId);
          return textResult(`User "${input.id}" reactivated.`);
        }
        case "revokeUserSessions": {
          if (!input.id)
            return errorResult("'id' is required for revokeUserSessions");
          await revokeAllUserSessions(input.id, ctx.userId);
          return textResult(`All sessions revoked for user "${input.id}".`);
        }
        case "revokeUserApiKeys": {
          if (!input.id)
            return errorResult("'id' is required for revokeUserApiKeys");
          await revokeAllUserApiKeys(input.id, ctx.userId);
          return textResult(`All API keys revoked for user "${input.id}".`);
        }
        case "deleteUser": {
          if (!input.id) return errorResult("'id' is required for deleteUser");
          await deleteUserByAdmin(input.id, ctx.userId);
          return textResult(`User "${input.id}" deleted.`);
        }

        // Provider Test, Presets & Catalog
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

        // Model Import
        case "inspectImportUrl": {
          const url = input.data?.url;
          if (typeof url !== "string")
            return errorResult(
              "'data.url' (string) is required for inspectImportUrl",
            );
          const inspection = await inspectImportUrl(url);
          return textResult(JSON.stringify(inspection, null, 2));
        }
        case "importModels": {
          if (!input.data?.entries)
            return errorResult(
              "'data.entries' (array of {id, config}) is required for importModels",
            );
          const result = await importModels(
            input.data.entries as Parameters<typeof importModels>[0],
            input.data.defaults as Parameters<typeof importModels>[1],
            ctx.userId,
          );
          return textResult(JSON.stringify(result, null, 2));
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
