/**
 * Admin Service Tests
 *
 * Tests admin role management, user lifecycle operations (suspend, reactivate,
 * delete, create), and the extended user listing. Runs against both SQLite
 * and PGlite to catch dialect-specific issues.
 *
 * Uses vi.resetModules() + dynamic imports because service modules destructure
 * `schema` at the top level. Each test run needs the schema to match the
 * test database dialect.
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestUser,
  DB_TEST_CONFIGS,
  initTestDatabase,
  type TestDatabase,
} from "./setup.js";
// Note: we don't import ValidationError for instanceof checks because
// vi.resetModules() creates new module instances, making instanceof fail.
// We use error message matching instead.

// ---------------------------------------------------------------------------
// Module mocks — redirect db singleton to the per-test in-memory database.
// The getter-based mock ensures modules pick up the current testDb on import.
// ---------------------------------------------------------------------------

const _testRef = vi.hoisted(() => ({
  db: null as any,
  txManager: null as any,
  schema: null as any,
}));

vi.mock("../../db/index.js", () => ({
  get db() {
    return _testRef.db;
  },
  get txManager() {
    return _testRef.txManager;
  },
  get schema() {
    return _testRef.schema;
  },
}));

vi.mock("../../lib/services/user-data.js", () => ({
  purgeUserData: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Dynamic module references — set in beforeEach after schema is configured
// ---------------------------------------------------------------------------

type AdminModule = typeof import("../../lib/services/admin.js");
type LifecycleModule = typeof import("../../lib/services/admin-lifecycle.js");

let ensureInstanceAdmin: AdminModule["ensureInstanceAdmin"];
let setUserRole: AdminModule["setUserRole"];
let createUserByAdmin: LifecycleModule["createUserByAdmin"];
let deleteUserByAdmin: LifecycleModule["deleteUserByAdmin"];
let suspendUser: LifecycleModule["suspendUser"];
let reactivateUser: LifecycleModule["reactivateUser"];
let revokeAllUserSessions: LifecycleModule["revokeAllUserSessions"];
let revokeAllUserApiKeys: LifecycleModule["revokeAllUserApiKeys"];
let listUsersAdminExtended: LifecycleModule["listUsersAdminExtended"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 15)}`;
}

async function createTestSession(
  testDb: TestDatabase,
  userId: string,
): Promise<string> {
  const { db, schema } = testDb;
  const sessionId = generateId("sess");
  const token = `tok-${Math.random().toString(36).substring(2)}`;
  const expires = new Date(Date.now() + 86400000);

  await db.insert(schema.sessions).values({
    id: sessionId,
    userId,
    token,
    expiresAt: expires,
  });
  return sessionId;
}

async function createTestActor(
  testDb: TestDatabase,
  ownerUserId: string,
): Promise<string> {
  const { db, schema } = testDb;
  const actorId = generateId("actor");
  await db.insert(schema.actors).values({
    id: actorId,
    ownerUserId,
    kind: "human",
    displayName: "Test Actor",
  });
  return actorId;
}

async function createTestCredential(
  testDb: TestDatabase,
  actorId: string,
  ownerUserId: string,
): Promise<string> {
  const { db, schema } = testDb;

  // Create a grant first (required FK)
  const grantId = generateId("grant");
  await db.insert(schema.actorGrants).values({
    id: grantId,
    actorId,
    ownerUserId,
    name: "Test Grant",
    scopes: JSON.stringify(["*"]),
  });

  // Create the credential
  const credId = generateId("cred");
  await db.insert(schema.actorCredentials).values({
    id: credId,
    actorId,
    ownerUserId,
    grantId,
    keyId: generateId("kid"),
    keyHash: "test-hash",
    keySuffix: "test",
    name: "Test Key",
    isActive: true,
  });

  return credId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.each(DB_TEST_CONFIGS)("$label - Admin Service Tests", ({
  dbType,
  label: _label,
}) => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    // Reset module cache so service modules re-evaluate with the new schema
    vi.resetModules();

    testDb = await initTestDatabase(dbType);
    _testRef.db = testDb.db;
    _testRef.txManager = testDb.txManager;
    _testRef.schema = testDb.schema;

    // Dynamically import service modules — they destructure `schema` at
    // the top level, so they need a valid schema at import time.
    const adminMod = await import("../../lib/services/admin.js");
    ensureInstanceAdmin = adminMod.ensureInstanceAdmin;
    setUserRole = adminMod.setUserRole;

    const lifecycleMod = await import("../../lib/services/admin-lifecycle.js");
    createUserByAdmin = lifecycleMod.createUserByAdmin;
    deleteUserByAdmin = lifecycleMod.deleteUserByAdmin;
    suspendUser = lifecycleMod.suspendUser;
    reactivateUser = lifecycleMod.reactivateUser;
    revokeAllUserSessions = lifecycleMod.revokeAllUserSessions;
    revokeAllUserApiKeys = lifecycleMod.revokeAllUserApiKeys;
    listUsersAdminExtended = lifecycleMod.listUsersAdminExtended;
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.cleanup();
    }
  });

  // -----------------------------------------------------------------------
  // ensureInstanceAdmin
  // -----------------------------------------------------------------------

  describe("ensureInstanceAdmin", () => {
    it("promotes first user when no admin exists", async () => {
      const user = await createTestUser(testDb, { email: "first@test.com" });

      await ensureInstanceAdmin();

      const result = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, user.id),
      });
      expect(result?.isInstanceAdmin).toBe(true);
    });

    it("no-op when admin already exists", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      const user2 = await createTestUser(testDb, {
        email: "user2@test.com",
      });

      await ensureInstanceAdmin();

      const adminRow = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, admin.id),
      });
      const user2Row = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, user2.id),
      });
      expect(adminRow?.isInstanceAdmin).toBe(true);
      expect(user2Row?.isInstanceAdmin).toBe(false);
    });

    it("no-op when no users exist", async () => {
      await expect(ensureInstanceAdmin()).resolves.toBeUndefined();
    });

    it("promotes earliest user when multiple users exist", async () => {
      const user1 = await createTestUser(testDb, {
        email: "earliest@test.com",
      });
      // Small delay to ensure different createdAt
      await new Promise((r) => setTimeout(r, 10));
      const user2 = await createTestUser(testDb, {
        email: "later@test.com",
      });

      await ensureInstanceAdmin();

      const row1 = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, user1.id),
      });
      const row2 = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, user2.id),
      });
      expect(row1?.isInstanceAdmin).toBe(true);
      expect(row2?.isInstanceAdmin).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // setUserRole
  // -----------------------------------------------------------------------

  describe("setUserRole", () => {
    it("promotes a regular user to admin", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      const user = await createTestUser(testDb, {
        email: "user@test.com",
      });

      await setUserRole(user.id, true, admin.id);

      const result = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, user.id),
      });
      expect(result?.isInstanceAdmin).toBe(true);
    });

    it("demotes an admin when another admin exists", async () => {
      const admin1 = await createTestUser(testDb, {
        email: "admin1@test.com",
        isInstanceAdmin: true,
      });
      const admin2 = await createTestUser(testDb, {
        email: "admin2@test.com",
        isInstanceAdmin: true,
      });

      await setUserRole(admin2.id, false, admin1.id);

      const result = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, admin2.id),
      });
      expect(result?.isInstanceAdmin).toBe(false);
    });

    it("rejects demotion of last admin", async () => {
      const admin = await createTestUser(testDb, {
        email: "sole-admin@test.com",
        isInstanceAdmin: true,
      });

      await expect(setUserRole(admin.id, false, admin.id)).rejects.toThrow(
        /last instance admin/i,
      );

      // Verify not demoted
      const result = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, admin.id),
      });
      expect(result?.isInstanceAdmin).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // createUserByAdmin
  // -----------------------------------------------------------------------

  describe("createUserByAdmin", () => {
    it("creates user and credential account", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });

      const created = await createUserByAdmin(
        "newuser@test.com",
        "password123",
        "New User",
        admin.id,
      );

      expect(created.email).toBe("newuser@test.com");
      expect(created.displayName).toBe("New User");
      expect(created.id).toBeTruthy();

      // Verify user row
      const userRow = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, created.id),
      });
      expect(userRow).toBeDefined();
      expect(userRow?.isInstanceAdmin).toBe(false);
      expect(userRow?.accountStatus).toBe("active");

      // Verify credential account
      const account = await testDb.db.query.accounts.findFirst({
        where: eq(testDb.schema.accounts.userId, created.id),
      });
      expect(account).toBeDefined();
      expect(account?.providerId).toBe("credential");
    });

    it("rejects duplicate email (case-insensitive)", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });

      await createUserByAdmin("user@test.com", "password123", null, admin.id);

      await expect(
        createUserByAdmin("User@Test.COM", "password456", null, admin.id),
      ).rejects.toThrow(/already exists/i);
    });
  });

  // -----------------------------------------------------------------------
  // suspendUser
  // -----------------------------------------------------------------------

  describe("suspendUser", () => {
    it("sets accountStatus to suspended", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      const user = await createTestUser(testDb, {
        email: "user@test.com",
      });

      await suspendUser(user.id, admin.id);

      const result = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, user.id),
      });
      expect(result?.accountStatus).toBe("suspended");
    });

    it("deletes all user sessions", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      const user = await createTestUser(testDb, {
        email: "user@test.com",
      });

      await createTestSession(testDb, user.id);
      await createTestSession(testDb, user.id);

      await suspendUser(user.id, admin.id);

      const remaining = await testDb.db.query.sessions.findMany({
        where: eq(testDb.schema.sessions.userId, user.id),
      });
      expect(remaining).toHaveLength(0);
    });

    it("deactivates all user credentials", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      const user = await createTestUser(testDb, {
        email: "user@test.com",
      });

      const actorId = await createTestActor(testDb, user.id);
      await createTestCredential(testDb, actorId, user.id);

      await suspendUser(user.id, admin.id);

      const creds = await testDb.db.query.actorCredentials.findMany({
        where: eq(testDb.schema.actorCredentials.ownerUserId, user.id),
      });
      for (const cred of creds) {
        expect(cred.isActive).toBe(false);
      }
    });

    it("rejects suspension of admin user", async () => {
      const admin1 = await createTestUser(testDb, {
        email: "admin1@test.com",
        isInstanceAdmin: true,
      });
      const admin2 = await createTestUser(testDb, {
        email: "admin2@test.com",
        isInstanceAdmin: true,
      });

      await expect(suspendUser(admin2.id, admin1.id)).rejects.toThrow(
        /admin account/i,
      );
    });

    it("rejects suspension of non-existent user", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });

      await expect(suspendUser("nonexistent-id", admin.id)).rejects.toThrow(
        /not found/i,
      );
    });
  });

  // -----------------------------------------------------------------------
  // reactivateUser
  // -----------------------------------------------------------------------

  describe("reactivateUser", () => {
    it("sets accountStatus back to active", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      const user = await createTestUser(testDb, {
        email: "user@test.com",
        accountStatus: "suspended",
      });

      await reactivateUser(user.id, admin.id);

      const result = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, user.id),
      });
      expect(result?.accountStatus).toBe("active");
    });

    it("rejects reactivation of admin user", async () => {
      const admin1 = await createTestUser(testDb, {
        email: "admin1@test.com",
        isInstanceAdmin: true,
      });
      const admin2 = await createTestUser(testDb, {
        email: "admin2@test.com",
        isInstanceAdmin: true,
      });

      await expect(reactivateUser(admin2.id, admin1.id)).rejects.toThrow(
        /admin account/i,
      );
    });
  });

  // -----------------------------------------------------------------------
  // revokeAllUserSessions
  // -----------------------------------------------------------------------

  describe("revokeAllUserSessions", () => {
    it("deletes all sessions for user", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      const user = await createTestUser(testDb, {
        email: "user@test.com",
      });

      await createTestSession(testDb, user.id);
      await createTestSession(testDb, user.id);
      await createTestSession(testDb, user.id);

      await revokeAllUserSessions(user.id, admin.id);

      const remaining = await testDb.db.query.sessions.findMany({
        where: eq(testDb.schema.sessions.userId, user.id),
      });
      expect(remaining).toHaveLength(0);
    });

    it("no error when user has no sessions", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      const user = await createTestUser(testDb, {
        email: "user@test.com",
      });

      await expect(
        revokeAllUserSessions(user.id, admin.id),
      ).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // revokeAllUserApiKeys
  // -----------------------------------------------------------------------

  describe("revokeAllUserApiKeys", () => {
    it("deactivates all credentials for user", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      const user = await createTestUser(testDb, {
        email: "user@test.com",
      });

      const actorId = await createTestActor(testDb, user.id);
      await createTestCredential(testDb, actorId, user.id);
      await createTestCredential(testDb, actorId, user.id);

      await revokeAllUserApiKeys(user.id, admin.id);

      const creds = await testDb.db.query.actorCredentials.findMany({
        where: eq(testDb.schema.actorCredentials.ownerUserId, user.id),
      });
      expect(creds.length).toBeGreaterThan(0);
      for (const cred of creds) {
        expect(cred.isActive).toBe(false);
      }
    });

    it("no error when user has no credentials", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      const user = await createTestUser(testDb, {
        email: "user@test.com",
      });

      await expect(
        revokeAllUserApiKeys(user.id, admin.id),
      ).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // deleteUserByAdmin
  // -----------------------------------------------------------------------

  describe("deleteUserByAdmin", () => {
    it("deletes user and cleans up sessions", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      const user = await createTestUser(testDb, {
        email: "target@test.com",
      });

      await createTestSession(testDb, user.id);

      await deleteUserByAdmin(user.id, admin.id);

      const deleted = await testDb.db.query.users.findFirst({
        where: eq(testDb.schema.users.id, user.id),
      });
      expect(deleted).toBeUndefined();

      const sessions = await testDb.db.query.sessions.findMany({
        where: eq(testDb.schema.sessions.userId, user.id),
      });
      expect(sessions).toHaveLength(0);
    });

    it("rejects self-deletion", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });

      await expect(deleteUserByAdmin(admin.id, admin.id)).rejects.toThrow(
        /own account/i,
      );
    });

    it("rejects deletion of admin user", async () => {
      const admin1 = await createTestUser(testDb, {
        email: "admin1@test.com",
        isInstanceAdmin: true,
      });
      const admin2 = await createTestUser(testDb, {
        email: "admin2@test.com",
        isInstanceAdmin: true,
      });

      await expect(deleteUserByAdmin(admin2.id, admin1.id)).rejects.toThrow(
        /admin account/i,
      );
    });

    it("rejects deletion of non-existent user", async () => {
      const admin = await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });

      await expect(
        deleteUserByAdmin("nonexistent-id", admin.id),
      ).rejects.toThrow(/not found/i);
    });
  });

  // -----------------------------------------------------------------------
  // listUsersAdminExtended
  // -----------------------------------------------------------------------

  describe("listUsersAdminExtended", () => {
    it("returns all users with correct fields", async () => {
      await createTestUser(testDb, {
        email: "admin@test.com",
        isInstanceAdmin: true,
      });
      await createTestUser(testDb, {
        email: "regular@test.com",
      });

      const items = await listUsersAdminExtended();

      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("email");
        expect(item).toHaveProperty("isInstanceAdmin");
        expect(item).toHaveProperty("accountStatus");
        expect(item).toHaveProperty("activeSessionCount");
        expect(item).toHaveProperty("activeApiKeyCount");
      }
    });

    it("includes correct session and credential counts", async () => {
      const user1 = await createTestUser(testDb, {
        email: "user1@test.com",
      });
      const user2 = await createTestUser(testDb, {
        email: "user2@test.com",
      });

      // user1 gets 2 sessions, user2 gets 0
      await createTestSession(testDb, user1.id);
      await createTestSession(testDb, user1.id);

      // user1 gets 1 credential
      const actorId = await createTestActor(testDb, user1.id);
      await createTestCredential(testDb, actorId, user1.id);

      const items = await listUsersAdminExtended();
      const u1 = items.find((i) => i.id === user1.id);
      const u2 = items.find((i) => i.id === user2.id);

      expect(u1?.activeSessionCount).toBe(2);
      expect(u1?.activeApiKeyCount).toBe(1);
      expect(u2?.activeSessionCount).toBe(0);
      expect(u2?.activeApiKeyCount).toBe(0);
    });
  });
});
