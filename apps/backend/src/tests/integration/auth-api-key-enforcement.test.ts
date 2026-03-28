/**
 * Integration tests for API key enforcement boundaries.
 *
 * Tests three areas:
 * 1. Routes with allowApiKey: false reject API keys (403)
 * 2. Scoped keys are enforced across all resource types
 * 3. conversations:invoke scope boundary
 *
 * Requires a running server at BASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

const adminFetch = createAuthenticatedFetch(TEST_API_KEY);

// Track keys for cleanup
const createdKeyIds: { actorId: string; keyId: string }[] = [];

async function getHumanActorId(): Promise<string> {
  const res = await adminFetch(`${BASE_URL}/actors`);
  const { items } = (await res.json()) as {
    items: { id: string; kind: string }[];
  };
  const human = items.find((a) => a.kind === "human");
  if (!human) throw new Error("No human actor found");
  return human.id;
}

async function createTestKey(
  actorId: string,
  dataAccess: string,
  adminAccess: string,
): Promise<string> {
  const res = await adminFetch(`${BASE_URL}/actors/${actorId}/api-keys`, {
    method: "POST",
    body: JSON.stringify({
      name: `enforcement-test-${dataAccess}-${adminAccess}-${Date.now()}`,
      dataAccess,
      adminAccess,
    }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string; key: string };
  createdKeyIds.push({ actorId, keyId: body.id });
  return body.key;
}

async function cleanupTestKeys() {
  for (const { actorId, keyId } of createdKeyIds) {
    try {
      await adminFetch(`${BASE_URL}/actors/${actorId}/api-keys/${keyId}`, {
        method: "DELETE",
      });
    } catch {
      // best effort
    }
  }
}

describe("API Key Enforcement", () => {
  let humanActorId: string;
  let readOnlyKey: string;
  let readWriteKey: string;

  beforeAll(async () => {
    humanActorId = await getHumanActorId();
    readOnlyKey = await createTestKey(humanActorId, "read", "none");
    readWriteKey = await createTestKey(humanActorId, "read_write", "none");
  }, 30_000);

  afterAll(async () => {
    await cleanupTestKeys();
  });

  describe("allowApiKey: false enforcement", () => {
    // Even with full-access TEST_API_KEY, these endpoints should return 403

    it("GET /api/user/api-keys rejects API key with 403", async () => {
      const res = await adminFetch(`${BASE_URL}/user/api-keys`);
      expect(res.status).toBe(403);
    });

    it("POST /api/user/api-keys rejects API key with 403", async () => {
      const res = await adminFetch(`${BASE_URL}/user/api-keys`, {
        method: "POST",
        body: JSON.stringify({ name: "should-fail" }),
      });
      expect(res.status).toBe(403);
    });

    it("DELETE /api/user/api-keys/:id rejects API key with 403", async () => {
      const res = await adminFetch(`${BASE_URL}/user/api-keys/fake-id`, {
        method: "DELETE",
      });
      expect(res.status).toBe(403);
    });

    it("PATCH /api/user/api-keys/:id rejects API key with 403", async () => {
      const res = await adminFetch(`${BASE_URL}/user/api-keys/fake-id`, {
        method: "PATCH",
        body: JSON.stringify({ name: "should-fail" }),
      });
      expect(res.status).toBe(403);
    });

    it("DELETE /api/user/data rejects API key with 403", async () => {
      const res = await adminFetch(`${BASE_URL}/user/data`, {
        method: "DELETE",
        body: JSON.stringify({ password: "irrelevant" }),
      });
      expect(res.status).toBe(403);
    });

    it("POST /api/actors/services rejects API key with 403", async () => {
      const res = await adminFetch(`${BASE_URL}/actors/services`, {
        method: "POST",
        body: JSON.stringify({ displayName: "should-fail" }),
      });
      expect(res.status).toBe(403);
    });

    it("DELETE /api/actors/services/:id rejects API key with 403", async () => {
      const res = await adminFetch(`${BASE_URL}/actors/services/fake-id`, {
        method: "DELETE",
      });
      expect(res.status).toBe(403);
    });

    it("GET /api/browser/status rejects API key with 403", async () => {
      const res = await adminFetch(`${BASE_URL}/browser/status`);
      expect(res.status).toBe(403);
    });
  });

  describe("conversations:invoke scope boundary", () => {
    it("read-only key can GET /api/sessions (conversations:read)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/sessions`);
      expect(res.status).toBe(200);
    });

    it("read-only key cannot POST /api/sessions (conversations:write required)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/sessions`, {
        method: "POST",
        body: JSON.stringify({ title: "should-fail" }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("read-only key — expanded resource coverage", () => {
    it("can GET /api/documents (assets:read)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/documents`);
      expect(res.status).toBe(200);
    });

    it("can GET /api/photos (assets:read)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/photos`);
      expect(res.status).toBe(200);
    });

    it("can GET /api/notes (assets:read)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/notes`);
      expect(res.status).toBe(200);
    });

    it("can GET /api/tags (assets:read)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/tags`);
      expect(res.status).toBe(200);
    });

    it("can GET /api/media (media:read)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/media`);
      expect(res.status).toBe(200);
    });

    it("can GET /api/history (history:read)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/history`);
      expect(res.status).toBe(200);
    });

    it("can GET /api/user (profile:read)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/user`);
      expect(res.status).toBe(200);
    });

    it("cannot PATCH /api/user/profile (profile:write required)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/user/profile`, {
        method: "PATCH",
        body: JSON.stringify({ displayName: "should-fail" }),
      });
      expect(res.status).toBe(403);
    });

    it("can GET /api/model (model:read)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/model`);
      expect(res.status).toBe(200);
    });

    it("can GET /api/channels (channels:read)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/channels`);
      expect(res.status).toBe(200);
    });

    it("cannot POST /api/channels (channels:write required)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name: "should-fail",
          platform: "discord",
          config: {},
        }),
      });
      expect(res.status).toBe(403);
    });

    it("cannot POST /api/notifications (notifications:write not in read scopes)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/notifications`, {
        method: "POST",
        body: JSON.stringify({
          message: "should-fail",
          severity: "info",
        }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("read-write key — can write resources", () => {
    it("can POST /api/feedback (feedback:write)", async () => {
      const fetch = createAuthenticatedFetch(readWriteKey);
      const res = await fetch(`${BASE_URL}/feedback`, {
        method: "POST",
        body: JSON.stringify({
          description: `Enforcement test feedback ${Date.now()}`,
          sentiment: "positive",
        }),
      });
      expect(res.status).toBe(201);
    });

    it("can POST /api/notes (assets:write)", async () => {
      const fetch = createAuthenticatedFetch(readWriteKey);
      const res = await fetch(`${BASE_URL}/notes`, {
        method: "POST",
        body: JSON.stringify({
          title: `Enforcement test note ${Date.now()}`,
          content: "Test content",
        }),
      });
      expect([201, 202]).toContain(res.status);
    });

    it("cannot GET /api/admin/settings (admin:read required)", async () => {
      const fetch = createAuthenticatedFetch(readWriteKey);
      const res = await fetch(`${BASE_URL}/admin/settings`);
      expect(res.status).toBe(403);
    });
  });
});
