/**
 * Manage Admin Write Tool
 *
 * Write admin operations: create/update/delete providers, models, MCP servers,
 * set model selection, update instance settings, and manage users.
 * Admin-only. All actions require user approval.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { assertInstanceAdmin } from "../../auth-utils.js";
import {
  createProvider,
  updateProvider,
  deleteProvider,
  createModel,
  updateModel,
  deleteModel,
  importModels,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  setActiveModelForContext,
} from "../../services/ai-config.js";
import { setUserRole } from "../../services/admin.js";
import {
  createUserByAdmin,
  deleteUserByAdmin,
  reactivateUser,
  revokeAllUserApiKeys,
  revokeAllUserSessions,
  suspendUser,
} from "../../services/admin-lifecycle.js";
import { setInstanceSettings } from "../../services/instance-settings.js";

const inputSchema = z.object({
  action: z
    .enum([
      "createProvider",
      "updateProvider",
      "deleteProvider",
      "createModel",
      "updateModel",
      "deleteModel",
      "importModels",
      "createMcpServer",
      "updateMcpServer",
      "deleteMcpServer",
      "setModelSelection",
      "updateInstanceSettings",
      "createUser",
      "setUserRole",
      "suspendUser",
      "reactivateUser",
      "revokeUserSessions",
      "revokeUserApiKeys",
      "deleteUser",
    ])
    .describe("The admin write operation to perform"),
  id: z.string().optional().describe("Entity ID for update/delete operations"),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Configuration payload for create/update operations"),
  context: z
    .string()
    .optional()
    .describe("Model selection context key (e.g., 'backend', 'workers')"),
});

export const manageAdminWriteTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "manageAdminWrite",
  label: "Modify Admin Config",
  description:
    "Modify admin configuration: create/update/delete AI providers, models, MCP servers; set model selection; update instance settings; manage users. Requires instance admin role.",
  accessLevel: "write",
  inputSchema,
  promptGuidelines: [
    "Only perform admin write operations when the user explicitly requests them.",
    "Always show the current state before making changes (use manageAdminRead first).",
  ],
  needsApproval: true,
  execute: async (_callId, input, ctx) => {
    // Defense-in-depth: verify admin status
    try {
      await assertInstanceAdmin(ctx.userId);
    } catch {
      return errorResult(
        "This operation requires instance administrator privileges.",
      );
    }

    // Defense-in-depth: verify caller has admin:write scope if using API key
    const callerScopes = ctx.extra?.callerScopes as string[] | undefined;
    if (
      callerScopes &&
      !callerScopes.includes("*") &&
      !callerScopes.includes("admin:write")
    ) {
      return errorResult(
        "API key does not have admin:write scope for this operation.",
      );
    }

    try {
      switch (input.action) {
        // Providers
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

        // MCP Servers
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
        case "updateInstanceSettings": {
          if (!input.data)
            return errorResult("'data' is required for updateInstanceSettings");
          await setInstanceSettings(input.data, ctx.userId);
          return textResult("Instance settings updated successfully.");
        }

        // Users
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
