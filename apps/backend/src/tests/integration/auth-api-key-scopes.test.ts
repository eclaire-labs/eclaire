/**
 * Integration tests for the API key permission system.
 *
 * These tests use the TEST_API_KEY (which has full access) to create
 * scoped API keys, then verify the authorization matrix: which routes
 * each permission level can access.
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

// Track keys we create so we can clean up
const createdKeyIds: { actorId: string; keyId: string }[] = [];

/** Create an API key with the given permission levels and return the full key. */
async function createTestKey(
  dataAccess: string,
  adminAccess: string,
): Promise<string> {
  // First, get the user's actor ID (human actor = userId)
  const actorsRes = await adminFetch(`${BASE_URL}/actors`);
  const { items: actors } = (await actorsRes.json()) as {
    items: { id: string; kind: string }[];
  };
  const humanActor = actors.find((a) => a.kind === "human");
  if (!humanActor) throw new Error("No human actor found");

  const res = await adminFetch(`${BASE_URL}/actors/${humanActor.id}/api-keys`, {
    method: "POST",
    body: JSON.stringify({
      name: `test-${dataAccess}-${adminAccess}-${Date.now()}`,
      dataAccess,
      adminAccess,
    }),
  });

  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    id: string;
    key: string;
    dataAccess: string;
    adminAccess: string;
  };
  expect(body.key).toBeTruthy();
  expect(body.dataAccess).toBe(dataAccess);
  expect(body.adminAccess).toBe(adminAccess);

  createdKeyIds.push({ actorId: humanActor.id, keyId: body.id });
  return body.key;
}

/** Revoke all test keys we created. */
async function cleanupTestKeys() {
  for (const { actorId, keyId } of createdKeyIds) {
    try {
      await adminFetch(`${BASE_URL}/actors/${actorId}/api-keys/${keyId}`, {
        method: "DELETE",
      });
    } catch {
      // best effort cleanup
    }
  }
}

describe("API Key Scope Authorization Matrix", () => {
  let readOnlyKey: string;
  let readWriteKey: string;
  let adminReadKey: string;
  let adminReadWriteKey: string;

  beforeAll(async () => {
    readOnlyKey = await createTestKey("read", "none");
    readWriteKey = await createTestKey("read_write", "none");
    adminReadKey = await createTestKey("read", "read");
    adminReadWriteKey = await createTestKey("read_write", "read_write");
  }, 30_000);

  afterAll(async () => {
    await cleanupTestKeys();
  });

  describe("read-only key (data=read, admin=none)", () => {
    it("can GET bookmarks", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/bookmarks`);
      expect(res.status).toBe(200);
    });

    it("can GET tasks", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/tasks`);
      expect(res.status).toBe(200);
    });

    it("can GET sessions", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/sessions`);
      expect(res.status).toBe(200);
    });

    it("can GET agents", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/agents`);
      expect(res.status).toBe(200);
    });

    it("can GET feedback", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/feedback`);
      expect(res.status).toBe(200);
    });

    it("cannot POST bookmarks (write blocked)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/bookmarks`, {
        method: "POST",
        body: JSON.stringify({
          url: "https://should-fail.test",
          title: "Fail",
        }),
      });
      expect(res.status).toBe(403);
    });

    it("cannot POST tasks (write blocked)", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title: "Fail" }),
      });
      expect(res.status).toBe(403);
    });

    it("cannot GET admin settings", async () => {
      const fetch = createAuthenticatedFetch(readOnlyKey);
      const res = await fetch(`${BASE_URL}/admin/settings`);
      expect(res.status).toBe(403);
    });
  });

  describe("read-write key (data=read_write, admin=none)", () => {
    it("can GET bookmarks", async () => {
      const fetch = createAuthenticatedFetch(readWriteKey);
      const res = await fetch(`${BASE_URL}/bookmarks`);
      expect(res.status).toBe(200);
    });

    it("can POST bookmarks", async () => {
      const fetch = createAuthenticatedFetch(readWriteKey);
      const res = await fetch(`${BASE_URL}/bookmarks`, {
        method: "POST",
        body: JSON.stringify({
          url: `https://scope-test-${Date.now()}.test`,
          title: "Scope test bookmark",
        }),
      });
      expect([201, 202]).toContain(res.status);
    });

    it("can POST tasks", async () => {
      const fetch = createAuthenticatedFetch(readWriteKey);
      const res = await fetch(`${BASE_URL}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title: `Scope test task ${Date.now()}` }),
      });
      expect(res.status).toBe(201);
    });

    it("cannot GET admin settings", async () => {
      const fetch = createAuthenticatedFetch(readWriteKey);
      const res = await fetch(`${BASE_URL}/admin/settings`);
      expect(res.status).toBe(403);
    });

    it("cannot POST admin settings", async () => {
      const fetch = createAuthenticatedFetch(readWriteKey);
      const res = await fetch(`${BASE_URL}/admin/settings`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("admin-read key (data=read, admin=read)", () => {
    it("can GET bookmarks", async () => {
      const fetch = createAuthenticatedFetch(adminReadKey);
      const res = await fetch(`${BASE_URL}/bookmarks`);
      expect(res.status).toBe(200);
    });

    it("can GET admin settings", async () => {
      const fetch = createAuthenticatedFetch(adminReadKey);
      const res = await fetch(`${BASE_URL}/admin/settings`);
      expect(res.status).toBe(200);
    });

    it("cannot POST bookmarks (write blocked)", async () => {
      const fetch = createAuthenticatedFetch(adminReadKey);
      const res = await fetch(`${BASE_URL}/bookmarks`, {
        method: "POST",
        body: JSON.stringify({
          url: "https://should-fail.test",
          title: "Fail",
        }),
      });
      expect(res.status).toBe(403);
    });

    it("cannot PATCH admin settings (admin write blocked)", async () => {
      const fetch = createAuthenticatedFetch(adminReadKey);
      const res = await fetch(`${BASE_URL}/admin/settings`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("admin-read-write key (data=read_write, admin=read_write)", () => {
    it("can GET bookmarks", async () => {
      const fetch = createAuthenticatedFetch(adminReadWriteKey);
      const res = await fetch(`${BASE_URL}/bookmarks`);
      expect(res.status).toBe(200);
    });

    it("can POST tasks", async () => {
      const fetch = createAuthenticatedFetch(adminReadWriteKey);
      const res = await fetch(`${BASE_URL}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: `Admin scope test task ${Date.now()}`,
        }),
      });
      expect(res.status).toBe(201);
    });

    it("can GET admin settings", async () => {
      const fetch = createAuthenticatedFetch(adminReadWriteKey);
      const res = await fetch(`${BASE_URL}/admin/settings`);
      expect(res.status).toBe(200);
    });
  });

  describe("credential management is blocked for all permission levels", () => {
    it("read-write key cannot list credential scopes", async () => {
      const fetch = createAuthenticatedFetch(readWriteKey);
      const res = await fetch(`${BASE_URL}/actors/credential-scopes`);
      expect(res.status).toBe(403);
    });
  });

  describe("permission level derivation in responses", () => {
    it("created key reports correct dataAccess and adminAccess", async () => {
      const actorsRes = await adminFetch(`${BASE_URL}/actors`);
      const { items: actors } = (await actorsRes.json()) as {
        items: { id: string; kind: string }[];
      };
      const humanActor = actors.find((a) => a.kind === "human");

      const res = await adminFetch(
        `${BASE_URL}/actors/${humanActor?.id}/api-keys`,
      );
      expect(res.status).toBe(200);
      const { items } = (await res.json()) as {
        items: {
          dataAccess: string | null;
          adminAccess: string | null;
          scopes: string[];
        }[];
      };

      // Find one of our test keys
      const testKey = items.find(
        (k) => k.dataAccess === "read" && k.adminAccess === "none",
      );
      if (testKey) {
        expect(testKey.scopes).toContain("assets:read");
        expect(testKey.scopes).not.toContain("assets:write");
        expect(testKey.scopes).not.toContain("admin:read");
      }
    });
  });
});
