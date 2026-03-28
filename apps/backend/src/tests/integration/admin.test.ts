/**
 * Integration tests for Admin API endpoints.
 *
 * Tests all admin endpoints at the HTTP level: auth enforcement, CRUD lifecycles
 * for providers/models/MCP servers/users, safety guards, and input validation.
 *
 * Requires a running server at BASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  TEST_API_KEY,
  TEST_API_KEY_2,
} from "../utils/test-helpers.js";

const ADMIN_URL = `${BASE_URL}/admin`;
const adminFetch = createAuthenticatedFetch(TEST_API_KEY);
const nonAdminFetch = createAuthenticatedFetch(TEST_API_KEY_2);

const ts = Date.now();

// Track created resources for cleanup
const cleanup = {
  userIds: [] as string[],
  providerIds: [] as string[],
  modelIds: [] as string[],
  mcpServerIds: [] as string[],
};

let adminUserId: string;

async function bestEffortDelete(path: string) {
  try {
    await adminFetch(`${ADMIN_URL}${path}`, { method: "DELETE" });
  } catch {
    // best effort
  }
}

describe("Admin API", () => {
  beforeAll(async () => {
    // Get the admin user's own ID (for self-deletion tests)
    const res = await adminFetch(`${BASE_URL}/user`);
    const body = (await res.json()) as { id: string };
    adminUserId = body.id;
  }, 15_000);

  afterAll(async () => {
    // Cleanup in reverse-dependency order
    for (const id of cleanup.userIds) {
      await bestEffortDelete(`/users/${id}`);
    }
    for (const id of cleanup.modelIds) {
      await bestEffortDelete(`/models/${id}`);
    }
    for (const id of cleanup.providerIds) {
      await bestEffortDelete(`/providers/${id}`);
    }
    for (const id of cleanup.mcpServerIds) {
      await bestEffortDelete(`/mcp-servers/${id}`);
    }
  });

  // ===========================================================================
  // 1. Auth Enforcement
  // ===========================================================================

  describe("auth enforcement", () => {
    it("returns 401 for unauthenticated GET /admin/settings", async () => {
      const res = await fetch(`${ADMIN_URL}/settings`);
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin GET /admin/settings", async () => {
      const res = await nonAdminFetch(`${ADMIN_URL}/settings`);
      expect(res.status).toBe(403);
    });

    it("returns 401 for unauthenticated GET /admin/users", async () => {
      const res = await fetch(`${ADMIN_URL}/users`);
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin POST /admin/providers", async () => {
      const res = await nonAdminFetch(`${ADMIN_URL}/providers`, {
        method: "POST",
        body: JSON.stringify({ id: "x", dialect: "openai" }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ===========================================================================
  // 2. Instance Settings
  // ===========================================================================

  describe("instance settings", () => {
    it("GET returns settings object", async () => {
      const res = await adminFetch(`${ADMIN_URL}/settings`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeTypeOf("object");
    });

    it("PATCH updates a setting and returns updated settings", async () => {
      const res = await adminFetch(`${ADMIN_URL}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ instanceName: `test-${ts}` }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.instanceName).toBe(`test-${ts}`);
    });

    it("GET reflects the patched setting", async () => {
      const res = await adminFetch(`${ADMIN_URL}/settings`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.instanceName).toBe(`test-${ts}`);
    });

    it("PATCH with empty body is a no-op (200)", async () => {
      const res = await adminFetch(`${ADMIN_URL}/settings`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
    });
  });

  // ===========================================================================
  // 3. Provider CRUD
  // ===========================================================================

  describe("provider CRUD", () => {
    const providerId = `test-provider-${ts}`;

    afterAll(async () => {
      // Remove from cleanup since we delete inline
      cleanup.providerIds = cleanup.providerIds.filter(
        (id) => id !== providerId,
      );
    });

    it("POST creates a provider", async () => {
      const res = await adminFetch(`${ADMIN_URL}/providers`, {
        method: "POST",
        body: JSON.stringify({
          id: providerId,
          dialect: "openai",
          name: "Test Provider",
          baseUrl: "http://localhost:9999",
        }),
      });
      expect(res.status).toBe(201);
      cleanup.providerIds.push(providerId);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(providerId);
    });

    it("GET list includes the created provider", async () => {
      const res = await adminFetch(`${ADMIN_URL}/providers`);
      expect(res.status).toBe(200);
      const { items } = (await res.json()) as { items: { id: string }[] };
      expect(items.find((p) => p.id === providerId)).toBeDefined();
    });

    it("GET single returns the provider", async () => {
      const res = await adminFetch(`${ADMIN_URL}/providers/${providerId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; dialect: string };
      expect(body.id).toBe(providerId);
      expect(body.dialect).toBe("openai");
    });

    it("PUT updates the provider", async () => {
      const res = await adminFetch(`${ADMIN_URL}/providers/${providerId}`, {
        method: "PUT",
        body: JSON.stringify({ name: "Updated Provider" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("Updated Provider");
    });

    it("POST test connection returns result", async () => {
      const res = await adminFetch(
        `${ADMIN_URL}/providers/${providerId}/test`,
        { method: "POST" },
      );
      // Returns 200 even on connection failure (success: false)
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean };
      expect(typeof body.success).toBe("boolean");
    });

    it("POST catalog on provider returns 400 (no real backend)", async () => {
      const res = await adminFetch(
        `${ADMIN_URL}/providers/${providerId}/catalog`,
        { method: "POST" },
      );
      // External fetch fails → 400
      expect([200, 400]).toContain(res.status);
    });

    it("DELETE removes the provider", async () => {
      const res = await adminFetch(`${ADMIN_URL}/providers/${providerId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { deleted: boolean };
      expect(body.deleted).toBe(true);
    });

    it("GET deleted provider returns 404", async () => {
      const res = await adminFetch(`${ADMIN_URL}/providers/${providerId}`);
      expect(res.status).toBe(404);
    });

    it("POST create missing id returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/providers`, {
        method: "POST",
        body: JSON.stringify({ dialect: "openai" }),
      });
      expect(res.status).toBe(400);
    });

    it("POST create missing dialect returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/providers`, {
        method: "POST",
        body: JSON.stringify({ id: "no-dialect" }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // 4. Model CRUD
  // ===========================================================================

  describe("model CRUD", () => {
    const modelProviderId = `test-model-provider-${ts}`;
    const modelId = `test-model-${ts}`;

    beforeAll(async () => {
      // Create a provider for models to reference
      await adminFetch(`${ADMIN_URL}/providers`, {
        method: "POST",
        body: JSON.stringify({
          id: modelProviderId,
          dialect: "openai",
          name: "Model Test Provider",
          baseUrl: "http://localhost:9999",
        }),
      });
      cleanup.providerIds.push(modelProviderId);
    }, 15_000);

    afterAll(async () => {
      cleanup.modelIds = cleanup.modelIds.filter((id) => id !== modelId);
    });

    it("POST creates a model", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models`, {
        method: "POST",
        body: JSON.stringify({
          id: modelId,
          name: "Test Model",
          provider: modelProviderId,
          providerModel: "gpt-test",
        }),
      });
      expect(res.status).toBe(201);
      cleanup.modelIds.push(modelId);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(modelId);
    });

    it("GET list includes the created model", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models`);
      expect(res.status).toBe(200);
      const { items } = (await res.json()) as { items: { id: string }[] };
      expect(items.find((m) => m.id === modelId)).toBeDefined();
    });

    it("GET single returns the model", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models/${modelId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; name: string };
      expect(body.id).toBe(modelId);
      expect(body.name).toBe("Test Model");
    });

    it("PUT updates the model", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models/${modelId}`, {
        method: "PUT",
        body: JSON.stringify({ name: "Updated Model" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("Updated Model");
    });

    it("DELETE removes the model", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models/${modelId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { deleted: boolean };
      expect(body.deleted).toBe(true);
    });

    it("GET deleted model returns 404", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models/${modelId}`);
      expect(res.status).toBe(404);
    });

    it("POST missing id returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models`, {
        method: "POST",
        body: JSON.stringify({
          name: "X",
          provider: modelProviderId,
          providerModel: "x",
        }),
      });
      expect(res.status).toBe(400);
    });

    it("POST missing name returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models`, {
        method: "POST",
        body: JSON.stringify({
          id: "x",
          provider: modelProviderId,
          providerModel: "x",
        }),
      });
      expect(res.status).toBe(400);
    });

    it("POST missing provider returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models`, {
        method: "POST",
        body: JSON.stringify({
          id: "x",
          name: "X",
          providerModel: "x",
        }),
      });
      expect(res.status).toBe(400);
    });

    it("POST missing providerModel returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models`, {
        method: "POST",
        body: JSON.stringify({
          id: "x",
          name: "X",
          provider: modelProviderId,
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // 5. Model Import & Inspect
  // ===========================================================================

  describe("model import & inspect", () => {
    it("POST inspect-url missing url returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models/inspect-url`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("POST inspect-url with invalid URL returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models/inspect-url`, {
        method: "POST",
        body: JSON.stringify({ url: "not-a-valid-url" }),
      });
      expect(res.status).toBe(400);
    });

    it("POST import missing models array returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models/import`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("POST import with empty models array returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/models/import`, {
        method: "POST",
        body: JSON.stringify({ models: [] }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // 6. Model Selection
  // ===========================================================================

  describe("model selection", () => {
    const selModelProviderId = `test-sel-provider-${ts}`;
    const selModelId = `test-sel-model-${ts}`;

    beforeAll(async () => {
      // Create a provider + model for selection tests
      await adminFetch(`${ADMIN_URL}/providers`, {
        method: "POST",
        body: JSON.stringify({
          id: selModelProviderId,
          dialect: "openai",
          name: "Selection Test Provider",
          baseUrl: "http://localhost:9999",
        }),
      });
      cleanup.providerIds.push(selModelProviderId);

      await adminFetch(`${ADMIN_URL}/models`, {
        method: "POST",
        body: JSON.stringify({
          id: selModelId,
          name: "Selection Test Model",
          provider: selModelProviderId,
          providerModel: "gpt-sel",
        }),
      });
      cleanup.modelIds.push(selModelId);
    }, 15_000);

    it("GET returns selections", async () => {
      const res = await adminFetch(`${ADMIN_URL}/model-selection`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeTypeOf("object");
    });

    it("PUT sets model for context", async () => {
      const res = await adminFetch(`${ADMIN_URL}/model-selection/chat`, {
        method: "PUT",
        body: JSON.stringify({ modelId: selModelId }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { context: string; modelId: string };
      expect(body.context).toBe("chat");
      expect(body.modelId).toBe(selModelId);
    });

    it("PUT missing modelId returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/model-selection/chat`, {
        method: "PUT",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("GET reflects the updated selection", async () => {
      const res = await adminFetch(`${ADMIN_URL}/model-selection`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      // The selection for "chat" should include our model
      expect(body).toHaveProperty("chat");
    });
  });

  // ===========================================================================
  // 7. MCP Server CRUD
  // ===========================================================================

  describe("MCP server CRUD", () => {
    const mcpId = `test-mcp-${ts}`;

    afterAll(async () => {
      cleanup.mcpServerIds = cleanup.mcpServerIds.filter((id) => id !== mcpId);
    });

    it("POST creates an MCP server", async () => {
      const res = await adminFetch(`${ADMIN_URL}/mcp-servers`, {
        method: "POST",
        body: JSON.stringify({
          id: mcpId,
          name: "Test MCP Server",
          transport: "sse",
          url: "http://localhost:9999/sse",
        }),
      });
      expect(res.status).toBe(201);
      cleanup.mcpServerIds.push(mcpId);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(mcpId);
    });

    it("GET list includes the created server", async () => {
      const res = await adminFetch(`${ADMIN_URL}/mcp-servers`);
      expect(res.status).toBe(200);
      const { items } = (await res.json()) as { items: { id: string }[] };
      expect(items.find((s) => s.id === mcpId)).toBeDefined();
    });

    it("GET single returns the server", async () => {
      const res = await adminFetch(`${ADMIN_URL}/mcp-servers/${mcpId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(mcpId);
    });

    it("PUT updates the server", async () => {
      const res = await adminFetch(`${ADMIN_URL}/mcp-servers/${mcpId}`, {
        method: "PUT",
        body: JSON.stringify({ name: "Updated MCP" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { name: string };
      expect(body.name).toBe("Updated MCP");
    });

    it("DELETE removes the server", async () => {
      const res = await adminFetch(`${ADMIN_URL}/mcp-servers/${mcpId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { deleted: boolean };
      expect(body.deleted).toBe(true);
    });

    it("GET deleted server returns 404", async () => {
      const res = await adminFetch(`${ADMIN_URL}/mcp-servers/${mcpId}`);
      expect(res.status).toBe(404);
    });

    it("POST missing id returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/mcp-servers`, {
        method: "POST",
        body: JSON.stringify({ name: "X", transport: "sse" }),
      });
      expect(res.status).toBe(400);
    });

    it("POST missing name returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/mcp-servers`, {
        method: "POST",
        body: JSON.stringify({ id: "x", transport: "sse" }),
      });
      expect(res.status).toBe(400);
    });

    it("POST missing transport returns 400", async () => {
      const res = await adminFetch(`${ADMIN_URL}/mcp-servers`, {
        method: "POST",
        body: JSON.stringify({ id: "x", name: "X" }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // 8. Provider Presets
  // ===========================================================================

  describe("provider presets", () => {
    it("GET returns a non-empty items array", async () => {
      const res = await adminFetch(`${ADMIN_URL}/provider-presets`);
      expect(res.status).toBe(200);
      const { items } = (await res.json()) as { items: unknown[] };
      expect(items).toBeInstanceOf(Array);
      expect(items.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 9. User Management
  // ===========================================================================

  describe("user management", () => {
    let createdUserId: string;
    let secondUserId: string;

    describe("create", () => {
      it("POST creates a user with email and password", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users`, {
          method: "POST",
          body: JSON.stringify({
            email: `test-user-${ts}@example.com`,
            password: "TestPass123!",
          }),
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as {
          id: string;
          email: string;
          displayName: string | null;
        };
        expect(body.id).toBeTypeOf("string");
        expect(body.email).toBe(`test-user-${ts}@example.com`);
        createdUserId = body.id;
        cleanup.userIds.push(createdUserId);
      });

      it("POST creates a user with displayName", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users`, {
          method: "POST",
          body: JSON.stringify({
            email: `test-user2-${ts}@example.com`,
            password: "TestPass123!",
            displayName: "Test User 2",
          }),
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as {
          id: string;
          displayName: string | null;
        };
        expect(body.displayName).toBe("Test User 2");
        secondUserId = body.id;
        cleanup.userIds.push(secondUserId);
      });
    });

    describe("list", () => {
      it("GET returns users with extended fields", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users`);
        expect(res.status).toBe(200);
        const { items } = (await res.json()) as {
          items: {
            id: string;
            email: string;
            isInstanceAdmin: boolean;
            accountStatus: string;
            activeSessionCount: number;
            activeApiKeyCount: number;
          }[];
        };
        expect(items).toBeInstanceOf(Array);
        const found = items.find((u) => u.id === createdUserId);
        expect(found).toBeDefined();
        expect(found!.email).toBe(`test-user-${ts}@example.com`);
        expect(found!.isInstanceAdmin).toBe(false);
        expect(found!.accountStatus).toBe("active");
        expect(typeof found!.activeSessionCount).toBe("number");
        expect(typeof found!.activeApiKeyCount).toBe("number");
      });
    });

    describe("role management", () => {
      it("PATCH promotes user to admin", async () => {
        const res = await adminFetch(
          `${ADMIN_URL}/users/${createdUserId}/role`,
          {
            method: "PATCH",
            body: JSON.stringify({ isInstanceAdmin: true }),
          },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { updated: boolean };
        expect(body.updated).toBe(true);
      });

      it("PATCH demotes user from admin (another admin exists)", async () => {
        const res = await adminFetch(
          `${ADMIN_URL}/users/${createdUserId}/role`,
          {
            method: "PATCH",
            body: JSON.stringify({ isInstanceAdmin: false }),
          },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { updated: boolean };
        expect(body.updated).toBe(true);
      });

      it("PATCH with non-boolean isInstanceAdmin returns 400", async () => {
        const res = await adminFetch(
          `${ADMIN_URL}/users/${createdUserId}/role`,
          {
            method: "PATCH",
            body: JSON.stringify({ isInstanceAdmin: "yes" }),
          },
        );
        expect(res.status).toBe(400);
      });
    });

    describe("suspend & reactivate", () => {
      it("POST suspends a user", async () => {
        const res = await adminFetch(
          `${ADMIN_URL}/users/${createdUserId}/suspend`,
          { method: "POST" },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { suspended: boolean };
        expect(body.suspended).toBe(true);
      });

      it("GET list shows user as suspended", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users`);
        const { items } = (await res.json()) as {
          items: { id: string; accountStatus: string }[];
        };
        const found = items.find((u) => u.id === createdUserId);
        expect(found!.accountStatus).toBe("suspended");
      });

      it("POST reactivates the user", async () => {
        const res = await adminFetch(
          `${ADMIN_URL}/users/${createdUserId}/reactivate`,
          { method: "POST" },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { reactivated: boolean };
        expect(body.reactivated).toBe(true);
      });

      it("GET list shows user as active again", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users`);
        const { items } = (await res.json()) as {
          items: { id: string; accountStatus: string }[];
        };
        const found = items.find((u) => u.id === createdUserId);
        expect(found!.accountStatus).toBe("active");
      });
    });

    describe("revoke sessions & API keys", () => {
      it("POST revoke-sessions succeeds", async () => {
        const res = await adminFetch(
          `${ADMIN_URL}/users/${createdUserId}/revoke-sessions`,
          { method: "POST" },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { revoked: boolean };
        expect(body.revoked).toBe(true);
      });

      it("POST revoke-api-keys succeeds", async () => {
        const res = await adminFetch(
          `${ADMIN_URL}/users/${createdUserId}/revoke-api-keys`,
          { method: "POST" },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { revoked: boolean };
        expect(body.revoked).toBe(true);
      });
    });

    describe("safety guards", () => {
      it("cannot demote the last instance admin", async () => {
        // The TEST_API_KEY user is the sole original admin
        const res = await adminFetch(`${ADMIN_URL}/users/${adminUserId}/role`, {
          method: "PATCH",
          body: JSON.stringify({ isInstanceAdmin: false }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("Cannot demote the last instance admin");
      });

      it("cannot suspend an admin user", async () => {
        const res = await adminFetch(
          `${ADMIN_URL}/users/${adminUserId}/suspend`,
          { method: "POST" },
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("admin account");
      });

      it("cannot delete an admin user", async () => {
        // Promote the test user to admin first, then try to delete
        await adminFetch(`${ADMIN_URL}/users/${createdUserId}/role`, {
          method: "PATCH",
          body: JSON.stringify({ isInstanceAdmin: true }),
        });

        const res = await adminFetch(`${ADMIN_URL}/users/${createdUserId}`, {
          method: "DELETE",
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("admin account");

        // Demote back for later tests
        await adminFetch(`${ADMIN_URL}/users/${createdUserId}/role`, {
          method: "PATCH",
          body: JSON.stringify({ isInstanceAdmin: false }),
        });
      });

      it("cannot delete your own account", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users/${adminUserId}`, {
          method: "DELETE",
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("Cannot delete your own account");
      });
    });

    describe("validation", () => {
      it("POST create missing email returns 400", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users`, {
          method: "POST",
          body: JSON.stringify({ password: "TestPass123!" }),
        });
        expect(res.status).toBe(400);
      });

      it("POST create missing password returns 400", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users`, {
          method: "POST",
          body: JSON.stringify({ email: "x@example.com" }),
        });
        expect(res.status).toBe(400);
      });

      it("POST create invalid email format returns 400", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users`, {
          method: "POST",
          body: JSON.stringify({
            email: "not-an-email",
            password: "TestPass123!",
          }),
        });
        expect(res.status).toBe(400);
      });

      it("POST create short password returns 400", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users`, {
          method: "POST",
          body: JSON.stringify({
            email: "short@example.com",
            password: "abc",
          }),
        });
        expect(res.status).toBe(400);
      });

      it("POST create duplicate email returns 400", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users`, {
          method: "POST",
          body: JSON.stringify({
            email: `test-user-${ts}@example.com`,
            password: "TestPass123!",
          }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("already exists");
      });
    });

    describe("edge cases", () => {
      const fakeUserId = "00000000-0000-0000-0000-000000000000";

      it("POST suspend non-existent user returns 400", async () => {
        const res = await adminFetch(
          `${ADMIN_URL}/users/${fakeUserId}/suspend`,
          { method: "POST" },
        );
        expect(res.status).toBe(400);
      });

      it("POST reactivate non-existent user returns 400", async () => {
        const res = await adminFetch(
          `${ADMIN_URL}/users/${fakeUserId}/reactivate`,
          { method: "POST" },
        );
        expect(res.status).toBe(400);
      });

      it("DELETE non-existent user returns 400", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users/${fakeUserId}`, {
          method: "DELETE",
        });
        expect(res.status).toBe(400);
      });
    });

    describe("delete", () => {
      it("DELETE removes the created users", async () => {
        // Delete second user first
        const res2 = await adminFetch(`${ADMIN_URL}/users/${secondUserId}`, {
          method: "DELETE",
        });
        expect(res2.status).toBe(200);
        cleanup.userIds = cleanup.userIds.filter((id) => id !== secondUserId);

        const res1 = await adminFetch(`${ADMIN_URL}/users/${createdUserId}`, {
          method: "DELETE",
        });
        expect(res1.status).toBe(200);
        cleanup.userIds = cleanup.userIds.filter((id) => id !== createdUserId);
      });

      it("GET list no longer includes deleted users", async () => {
        const res = await adminFetch(`${ADMIN_URL}/users`);
        const { items } = (await res.json()) as {
          items: { id: string }[];
        };
        expect(items.find((u) => u.id === createdUserId)).toBeUndefined();
        expect(items.find((u) => u.id === secondUserId)).toBeUndefined();
      });
    });
  });
});
