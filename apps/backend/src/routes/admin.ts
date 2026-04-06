import { Hono } from "hono";
import z from "zod/v4";
import type { ModelConfig, ProviderAuth, ProviderConfig } from "@eclaire/ai";
import { assertInstanceAdmin } from "../lib/auth-utils.js";
import { createChildLogger } from "../lib/logger.js";
import {
  createMcpServer,
  createModel,
  createProvider,
  decryptProviderAuth,
  deleteMcpServer,
  deleteModel,
  deleteProvider,
  getAllSelections,
  getMcpServer,
  getModel,
  getProvider,
  importModels,
  listMcpServers,
  listModels,
  listProviders,
  sanitizeProviderForResponse,
  setActiveModelForContext,
  testProviderConnection,
  updateMcpServer,
  updateModel,
  updateProvider,
} from "../lib/services/ai-config.js";
import {
  fetchProviderCatalog,
  inspectImportUrl,
  normalizeImportedModel,
} from "../lib/services/ai-import.js";
import type { ImportModelsRequest } from "../lib/services/ai-import-types.js";
import { listProviderPresets } from "../lib/services/ai-provider-presets.js";
import { setUserRole } from "../lib/services/admin.js";
import {
  createUserByAdmin,
  deleteUserByAdmin,
  listUsersAdminExtended,
  reactivateUser,
  revokeAllUserApiKeys,
  revokeAllUserSessions,
  suspendUser,
} from "../lib/services/admin-lifecycle.js";
import {
  getAllInstanceSettings,
  setInstanceSettings,
} from "../lib/services/instance-settings.js";
import { withAuth } from "../middleware/with-auth.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("admin");

export const adminRoutes = new Hono<{ Variables: RouteVariables }>();

// =============================================================================
// Instance Settings
// =============================================================================

// GET /api/admin/settings - Read all instance settings (admin only)
adminRoutes.get(
  "/settings",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const settings = await getAllInstanceSettings();
    return c.json(settings);
  }, logger),
);

// PATCH /api/admin/settings - Update instance settings (admin only)
adminRoutes.patch(
  "/settings",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const body = (await c.req.json()) as Record<string, unknown>;
    await setInstanceSettings(body, userId);
    const settings = await getAllInstanceSettings();
    return c.json(settings);
  }, logger),
);

// =============================================================================
// Model Selection
// =============================================================================

// GET /api/admin/model-selection - Get all context→model mappings (admin only)
adminRoutes.get(
  "/model-selection",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const selections = await getAllSelections();
    return c.json(selections);
  }, logger),
);

// PUT /api/admin/model-selection/:context - Set active model for context
adminRoutes.put(
  "/model-selection/:context",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const context = c.req.param("context");
    const { modelId } = (await c.req.json()) as { modelId: string };
    if (!modelId || typeof modelId !== "string") {
      return c.json({ error: "modelId is required" }, 400);
    }
    await setActiveModelForContext(context, modelId, userId);
    return c.json({ context, modelId });
  }, logger),
);

// =============================================================================
// Providers CRUD
// =============================================================================

// GET /api/admin/providers - List all providers
adminRoutes.get(
  "/providers",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const items = (await listProviders()).map(sanitizeProviderForResponse);
    return c.json({ items });
  }, logger),
);

// GET /api/admin/providers/:id - Get single provider
adminRoutes.get(
  "/providers/:id",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const provider = await getProvider(c.req.param("id"));
    if (!provider) {
      return c.json({ error: "Provider not found" }, 404);
    }
    return c.json(sanitizeProviderForResponse(provider));
  }, logger),
);

// POST /api/admin/providers - Create provider
adminRoutes.post(
  "/providers",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const body = (await c.req.json()) as { id: string } & Record<
      string,
      unknown
    >;
    if (!body.id || typeof body.id !== "string") {
      return c.json({ error: "id is required" }, 400);
    }
    if (!body.dialect || typeof body.dialect !== "string") {
      return c.json({ error: "dialect is required" }, 400);
    }
    const { id, ...config } = body;
    await createProvider(id, config as unknown as ProviderConfig, userId);
    const created = await getProvider(id);
    return c.json(
      created ? sanitizeProviderForResponse(created) : created,
      201,
    );
  }, logger),
);

// PUT /api/admin/providers/:id - Update provider
adminRoutes.put(
  "/providers/:id",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const body = (await c.req.json()) as Record<string, unknown>;
    await updateProvider(
      c.req.param("id"),
      body as Partial<ProviderConfig>,
      userId,
    );
    const updated = await getProvider(c.req.param("id"));
    return c.json(updated ? sanitizeProviderForResponse(updated) : updated);
  }, logger),
);

// DELETE /api/admin/providers/:id - Delete provider
adminRoutes.delete(
  "/providers/:id",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    await deleteProvider(c.req.param("id"));
    return c.json({ deleted: true });
  }, logger),
);

// POST /api/admin/providers/:id/test - Test provider connection
adminRoutes.post(
  "/providers/:id/test",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    try {
      const result = await testProviderConnection(c.req.param("id"));
      return c.json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json({ error: "Provider not found" }, 404);
      }
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : "Connection failed",
      });
    }
  }, logger),
);

// =============================================================================
// Models CRUD
// =============================================================================

// GET /api/admin/models - List all models with full details
adminRoutes.get(
  "/models",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const items = await listModels();
    return c.json({ items });
  }, logger),
);

// GET /api/admin/models/:id - Get single model
adminRoutes.get(
  "/models/:id",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const model = await getModel(c.req.param("id"));
    if (!model) {
      return c.json({ error: "Model not found" }, 404);
    }
    return c.json(model);
  }, logger),
);

// POST /api/admin/models - Create model
adminRoutes.post(
  "/models",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const body = (await c.req.json()) as { id: string } & Record<
      string,
      unknown
    >;
    if (!body.id || typeof body.id !== "string") {
      return c.json({ error: "id is required" }, 400);
    }
    if (!body.name || typeof body.name !== "string") {
      return c.json({ error: "name is required" }, 400);
    }
    if (!body.provider || typeof body.provider !== "string") {
      return c.json({ error: "provider is required" }, 400);
    }
    if (!body.providerModel || typeof body.providerModel !== "string") {
      return c.json({ error: "providerModel is required" }, 400);
    }
    const { id, ...config } = body;
    await createModel(id, config as unknown as ModelConfig, userId);
    const created = await getModel(id);
    return c.json(created, 201);
  }, logger),
);

// PUT /api/admin/models/:id - Update model
adminRoutes.put(
  "/models/:id",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const body = (await c.req.json()) as Record<string, unknown>;
    await updateModel(c.req.param("id"), body as Partial<ModelConfig>, userId);
    const updated = await getModel(c.req.param("id"));
    return c.json(updated);
  }, logger),
);

// DELETE /api/admin/models/:id - Delete model
adminRoutes.delete(
  "/models/:id",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    await deleteModel(c.req.param("id"));
    return c.json({ deleted: true });
  }, logger),
);

// =============================================================================
// MCP Servers CRUD
// =============================================================================

// GET /api/admin/mcp-servers - List all MCP servers
adminRoutes.get(
  "/mcp-servers",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const items = await listMcpServers();
    return c.json({ items });
  }, logger),
);

// GET /api/admin/mcp-servers/:id - Get single MCP server
adminRoutes.get(
  "/mcp-servers/:id",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const server = await getMcpServer(c.req.param("id"));
    if (!server) {
      return c.json({ error: "MCP server not found" }, 404);
    }
    return c.json(server);
  }, logger),
);

// POST /api/admin/mcp-servers - Create MCP server
adminRoutes.post(
  "/mcp-servers",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const body = (await c.req.json()) as { id: string } & Record<
      string,
      unknown
    >;
    if (!body.id || typeof body.id !== "string") {
      return c.json({ error: "id is required" }, 400);
    }
    if (!body.name || typeof body.name !== "string") {
      return c.json({ error: "name is required" }, 400);
    }
    if (!body.transport || typeof body.transport !== "string") {
      return c.json({ error: "transport is required" }, 400);
    }
    const { id, ...config } = body;
    await createMcpServer(
      id,
      config as Parameters<typeof createMcpServer>[1],
      userId,
    );
    const created = await getMcpServer(id);
    return c.json(created, 201);
  }, logger),
);

// PUT /api/admin/mcp-servers/:id - Update MCP server
adminRoutes.put(
  "/mcp-servers/:id",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const body = (await c.req.json()) as Record<string, unknown>;
    await updateMcpServer(
      c.req.param("id"),
      body as Parameters<typeof updateMcpServer>[1],
      userId,
    );
    const updated = await getMcpServer(c.req.param("id"));
    return c.json(updated);
  }, logger),
);

// DELETE /api/admin/mcp-servers/:id - Delete MCP server
adminRoutes.delete(
  "/mcp-servers/:id",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    await deleteMcpServer(c.req.param("id"));
    return c.json({ deleted: true });
  }, logger),
);

// =============================================================================
// User Management
// =============================================================================

// POST /api/admin/users - Create a new user (admin only)
const adminCreateUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().max(100).optional(),
});

adminRoutes.post(
  "/users",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const body = await c.req.json();
    const parsed = adminCreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        400,
      );
    }
    const { email, password, displayName } = parsed.data;
    const created = await createUserByAdmin(
      email.trim(),
      password,
      displayName?.trim() || null,
      userId,
    );
    return c.json(created, 201);
  }, logger),
);

// GET /api/admin/users - List all users (extended with status & counts)
adminRoutes.get(
  "/users",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const items = await listUsersAdminExtended();
    return c.json({ items });
  }, logger),
);

// PATCH /api/admin/users/:id/role - Update user role
adminRoutes.patch(
  "/users/:id/role",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const body = (await c.req.json()) as { isInstanceAdmin?: boolean };
    if (typeof body.isInstanceAdmin !== "boolean") {
      return c.json({ error: "isInstanceAdmin (boolean) is required" }, 400);
    }
    await setUserRole(c.req.param("id"), body.isInstanceAdmin, userId);
    return c.json({ updated: true });
  }, logger),
);

// POST /api/admin/users/:id/suspend - Suspend user
adminRoutes.post(
  "/users/:id/suspend",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    await suspendUser(c.req.param("id"), userId);
    return c.json({ suspended: true });
  }, logger),
);

// POST /api/admin/users/:id/reactivate - Reactivate user
adminRoutes.post(
  "/users/:id/reactivate",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    await reactivateUser(c.req.param("id"), userId);
    return c.json({ reactivated: true });
  }, logger),
);

// POST /api/admin/users/:id/revoke-sessions - Revoke all sessions
adminRoutes.post(
  "/users/:id/revoke-sessions",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    await revokeAllUserSessions(c.req.param("id"), userId);
    return c.json({ revoked: true });
  }, logger),
);

// POST /api/admin/users/:id/revoke-api-keys - Revoke all API keys
adminRoutes.post(
  "/users/:id/revoke-api-keys",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    await revokeAllUserApiKeys(c.req.param("id"), userId);
    return c.json({ revoked: true });
  }, logger),
);

// DELETE /api/admin/users/:id - Delete user
adminRoutes.delete(
  "/users/:id",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    await deleteUserByAdmin(c.req.param("id"), userId);
    return c.json({ deleted: true });
  }, logger),
);

// =============================================================================
// Provider Presets & Model Import
// =============================================================================

// GET /api/admin/provider-presets - List canonical provider presets
adminRoutes.get(
  "/provider-presets",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const items = listProviderPresets();
    return c.json({ items });
  }, logger),
);

// POST /api/admin/providers/:id/catalog - Fetch remote models from provider
adminRoutes.post(
  "/providers/:id/catalog",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const provider = await getProvider(c.req.param("id"));
    if (!provider) {
      return c.json({ error: "Provider not found" }, 404);
    }
    try {
      const decrypted = {
        ...provider,
        auth: decryptProviderAuth(provider.auth as ProviderAuth | undefined),
      };
      const items = await fetchProviderCatalog(decrypted);
      return c.json({ providerId: provider.id, items });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Catalog fetch failed";
      return c.json({ error: message }, 400);
    }
  }, logger),
);

// POST /api/admin/models/inspect-url - Inspect a HuggingFace or OpenRouter URL
adminRoutes.post(
  "/models/inspect-url",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const body = (await c.req.json()) as { url?: string };
    if (!body.url || typeof body.url !== "string") {
      return c.json({ error: "url is required" }, 400);
    }
    try {
      const result = await inspectImportUrl(body.url);
      return c.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Inspection failed";
      return c.json({ error: message }, 400);
    }
  }, logger),
);

// POST /api/admin/models/import - Import one or more models with optional defaults
adminRoutes.post(
  "/models/import",
  withAuth(async (c, userId) => {
    await assertInstanceAdmin(userId);
    const body = (await c.req.json()) as ImportModelsRequest;
    if (
      !body.models ||
      !Array.isArray(body.models) ||
      body.models.length === 0
    ) {
      return c.json({ error: "models array is required" }, 400);
    }
    try {
      const entries = body.models.map((entry) => normalizeImportedModel(entry));
      const result = await importModels(entries, body.setDefaults, userId);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      return c.json({ error: message }, 400);
    }
  }, logger),
);
