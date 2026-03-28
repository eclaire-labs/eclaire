/**
 * Integration tests for API key CRUD lifecycle.
 *
 * Tests the full lifecycle of actor API keys: create, list, update permissions,
 * rename, revoke, and verify that revoked keys are rejected.
 *
 * Requires a running server at BASE_URL.
 */
import { resolvePermissionScopes } from "@eclaire/api-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

const adminFetch = createAuthenticatedFetch(TEST_API_KEY);

let humanActorId: string;
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

describe("API Key CRUD Lifecycle", () => {
  beforeAll(async () => {
    humanActorId = await getHumanActorId();
  }, 15_000);

  afterAll(async () => {
    await cleanupTestKeys();
  });

  let createdKeyId: string;
  let createdFullKey: string;

  describe("create", () => {
    it("creates a read-only API key with correct response shape", async () => {
      const res = await adminFetch(
        `${BASE_URL}/actors/${humanActorId}/api-keys`,
        {
          method: "POST",
          body: JSON.stringify({
            name: `crud-test-${Date.now()}`,
            dataAccess: "read",
            adminAccess: "none",
          }),
        },
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;

      // Shape
      expect(body.id).toBeTypeOf("string");
      expect(body.key).toBeTypeOf("string");
      expect(body.displayKey).toBeTypeOf("string");
      expect(body.name).toBeTypeOf("string");
      expect(body.scopes).toBeInstanceOf(Array);
      expect(body.createdAt).toBeTypeOf("string");
      expect(body.isActive).toBe(true);

      // Key format
      expect(body.key).toMatch(/^sk-[A-Za-z0-9]{15}-[A-Za-z0-9]{32}$/);
      expect(body.displayKey).toMatch(
        /^sk-[A-Za-z0-9]{15}-\*{4}[A-Za-z0-9]{4}$/,
      );

      // Permission levels
      expect(body.dataAccess).toBe("read");
      expect(body.adminAccess).toBe("none");

      // Scopes match expected read-only scopes
      const expectedScopes = resolvePermissionScopes("read", "none");
      expect(new Set(body.scopes as string[])).toEqual(new Set(expectedScopes));

      createdKeyId = body.id as string;
      createdFullKey = body.key as string;
      createdKeyIds.push({ actorId: humanActorId, keyId: createdKeyId });
    });

    it("created key can authenticate successfully", async () => {
      const scopedFetch = createAuthenticatedFetch(createdFullKey);
      const res = await scopedFetch(`${BASE_URL}/bookmarks`);
      expect(res.status).toBe(200);
    });
  });

  describe("list", () => {
    it("lists API keys and includes the created key", async () => {
      const res = await adminFetch(
        `${BASE_URL}/actors/${humanActorId}/api-keys`,
      );
      expect(res.status).toBe(200);

      const { items } = (await res.json()) as {
        items: { id: string; isActive: boolean }[];
      };

      expect(items).toBeInstanceOf(Array);
      const found = items.find((k) => k.id === createdKeyId);
      expect(found).toBeDefined();
      expect(found!.isActive).toBe(true);
    });
  });

  describe("update permissions", () => {
    it("updates dataAccess and adminAccess together", async () => {
      const res = await adminFetch(
        `${BASE_URL}/actors/${humanActorId}/api-keys/${createdKeyId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            dataAccess: "read_write",
            adminAccess: "none",
          }),
        },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.dataAccess).toBe("read_write");
      expect(body.adminAccess).toBe("none");

      const expectedScopes = resolvePermissionScopes("read_write", "none");
      expect(new Set(body.scopes as string[])).toEqual(new Set(expectedScopes));
    });

    it("updated key can now write (was read-only before)", async () => {
      const scopedFetch = createAuthenticatedFetch(createdFullKey);
      const res = await scopedFetch(`${BASE_URL}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title: `CRUD test task ${Date.now()}` }),
      });
      expect(res.status).toBe(201);
    });
  });

  describe("update name", () => {
    it("renames the API key", async () => {
      const newName = `renamed-crud-test-${Date.now()}`;
      const res = await adminFetch(
        `${BASE_URL}/actors/${humanActorId}/api-keys/${createdKeyId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: newName }),
        },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { name: string };
      expect(body.name).toBe(newName);
    });
  });

  describe("revoke", () => {
    it("revokes the API key (204)", async () => {
      const res = await adminFetch(
        `${BASE_URL}/actors/${humanActorId}/api-keys/${createdKeyId}`,
        { method: "DELETE" },
      );
      expect(res.status).toBe(204);

      // Remove from cleanup list since it's already revoked
      const idx = createdKeyIds.findIndex((k) => k.keyId === createdKeyId);
      if (idx !== -1) createdKeyIds.splice(idx, 1);
    });

    it("revoked key no longer appears in list", async () => {
      const res = await adminFetch(
        `${BASE_URL}/actors/${humanActorId}/api-keys`,
      );
      expect(res.status).toBe(200);

      const { items } = (await res.json()) as {
        items: { id: string }[];
      };
      const found = items.find((k) => k.id === createdKeyId);
      expect(found).toBeUndefined();
    });

    it("revoked key is rejected with 401", async () => {
      const revokedFetch = createAuthenticatedFetch(createdFullKey);
      const res = await revokedFetch(`${BASE_URL}/bookmarks`);
      expect(res.status).toBe(401);
    });
  });
});
