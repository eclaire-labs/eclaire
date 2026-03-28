/**
 * Admin Lifecycle Service
 *
 * Centralizes admin user-management operations: suspend, reactivate,
 * revoke sessions, revoke API keys, and delete user.
 */

import { generateUserId } from "@eclaire/core";
import { hashPassword } from "better-auth/crypto";
import { count, eq, sql } from "drizzle-orm";
import { db, schema, txManager } from "../../db/index.js";
import { ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { recordHistory } from "./history.js";
import { purgeUserData } from "./user-data.js";

const logger = createChildLogger("services:admin-lifecycle");

const { users, accounts, sessions, actorCredentials, actorGrants } = schema;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertNotAdmin(targetUserId: string): Promise<void> {
  const target = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
    columns: { isInstanceAdmin: true },
  });
  if (target?.isInstanceAdmin) {
    throw new ValidationError(
      "Cannot perform this action on an admin account. Demote the user first.",
    );
  }
}

async function assertUserExists(
  userId: string,
): Promise<{ id: string; email: string; displayName: string | null }> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, email: true, displayName: true },
  });
  if (!user) {
    throw new ValidationError("User not found");
  }
  return user;
}

function recordAdminAction(
  action:
    | "admin.create_user"
    | "admin.suspend"
    | "admin.reactivate"
    | "admin.revoke_sessions"
    | "admin.revoke_api_keys"
    | "admin.delete_user"
    | "admin.role_change",
  targetUserId: string,
  adminUserId: string,
  metadata?: Record<string, unknown>,
) {
  return recordHistory({
    action,
    itemType: "user_account",
    itemId: targetUserId,
    actor: "human",
    actorId: adminUserId,
    userId: targetUserId,
    metadata: metadata ?? null,
  });
}

// ---------------------------------------------------------------------------
// Suspend
// ---------------------------------------------------------------------------

export async function suspendUser(
  targetUserId: string,
  adminUserId: string,
): Promise<void> {
  const target = await assertUserExists(targetUserId);
  await assertNotAdmin(targetUserId);

  await txManager.withTransaction(async (tx) => {
    // Set status to suspended
    await tx.users.update(eq(users.id, targetUserId), {
      accountStatus: "suspended",
      updatedAt: new Date(),
    });

    // Revoke all sessions immediately
    await tx.sessions.delete(eq(sessions.userId, targetUserId));

    // Deactivate all API credentials
    await tx.actorCredentials.update(
      eq(actorCredentials.ownerUserId, targetUserId),
      { isActive: false, updatedAt: new Date() },
    );
  });

  await recordAdminAction("admin.suspend", targetUserId, adminUserId, {
    email: target.email,
  });

  logger.info(
    { targetUserId, adminUserId },
    "User suspended, sessions and API keys revoked",
  );
}

// ---------------------------------------------------------------------------
// Reactivate
// ---------------------------------------------------------------------------

export async function reactivateUser(
  targetUserId: string,
  adminUserId: string,
): Promise<void> {
  const target = await assertUserExists(targetUserId);
  await assertNotAdmin(targetUserId);

  await db
    .update(users)
    .set({ accountStatus: "active", updatedAt: new Date() })
    .where(eq(users.id, targetUserId));

  await recordAdminAction("admin.reactivate", targetUserId, adminUserId, {
    email: target.email,
  });

  logger.info(
    { targetUserId, adminUserId },
    "User reactivated (sessions and API keys not restored)",
  );
}

// ---------------------------------------------------------------------------
// Revoke Sessions
// ---------------------------------------------------------------------------

export async function revokeAllUserSessions(
  targetUserId: string,
  adminUserId: string,
): Promise<void> {
  await assertUserExists(targetUserId);

  const result = await db
    .delete(sessions)
    .where(eq(sessions.userId, targetUserId));

  await recordAdminAction("admin.revoke_sessions", targetUserId, adminUserId);

  logger.info(
    { targetUserId, adminUserId, result },
    "All user sessions revoked",
  );
}

// ---------------------------------------------------------------------------
// Revoke API Keys
// ---------------------------------------------------------------------------

export async function revokeAllUserApiKeys(
  targetUserId: string,
  adminUserId: string,
): Promise<void> {
  await assertUserExists(targetUserId);

  await db
    .update(actorCredentials)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(actorCredentials.ownerUserId, targetUserId));

  await recordAdminAction("admin.revoke_api_keys", targetUserId, adminUserId);

  logger.info({ targetUserId, adminUserId }, "All user API keys deactivated");
}

// ---------------------------------------------------------------------------
// Delete User
// ---------------------------------------------------------------------------

export async function deleteUserByAdmin(
  targetUserId: string,
  adminUserId: string,
): Promise<void> {
  if (targetUserId === adminUserId) {
    throw new ValidationError(
      "Cannot delete your own account from the admin panel",
    );
  }

  const target = await assertUserExists(targetUserId);
  await assertNotAdmin(targetUserId);

  logger.info(
    { targetUserId, adminUserId, email: target.email },
    "Starting admin-initiated user deletion",
  );

  // 1. Revoke all sessions, credentials, and grants atomically
  await txManager.withTransaction(async (tx) => {
    await tx.sessions.delete(eq(sessions.userId, targetUserId));
    await tx.actorCredentials.delete(
      eq(actorCredentials.ownerUserId, targetUserId),
    );
    await tx.actorGrants.delete(eq(actorGrants.ownerUserId, targetUserId));
  });

  // 2. Purge all user-owned data (assets, history, preferences, storage)
  //    Runs outside the transaction — touches many tables via purgeUserData.
  await purgeUserData(targetUserId);

  // 3. Record admin action (recorded AFTER purge since purge deletes history)
  // We record to the admin's history, not the target's
  await recordHistory({
    action: "admin.delete_user",
    itemType: "user_account",
    itemId: targetUserId,
    actor: "human",
    actorId: adminUserId,
    userId: adminUserId,
    metadata: { email: target.email, displayName: target.displayName },
  });

  // 4. Delete the user account itself (accounts cascade via FK)
  await db.delete(users).where(eq(users.id, targetUserId));

  logger.info(
    { targetUserId, adminUserId, email: target.email },
    "User account deleted by admin",
  );
}

// ---------------------------------------------------------------------------
// Create User
// ---------------------------------------------------------------------------

export async function createUserByAdmin(
  email: string,
  password: string,
  displayName: string | null,
  adminUserId: string,
): Promise<{ id: string; email: string; displayName: string | null }> {
  // Check for duplicate email (case-insensitive)
  const existing = await db.query.users.findFirst({
    where: eq(sql`lower(${users.email})`, email.toLowerCase()),
    columns: { id: true },
  });
  if (existing) {
    throw new ValidationError("A user with this email already exists");
  }

  const userId = generateUserId();
  const now = new Date();
  const hashed = await hashPassword(password);

  // Insert user row
  // biome-ignore lint/suspicious/noExplicitAny: union type has incompatible insert signatures
  await (db as any).insert(users).values({
    id: userId,
    email,
    displayName,
    userType: "user",
    isInstanceAdmin: false,
    accountStatus: "active",
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });

  // Insert credential account (matches Better Auth's email+password provider)
  // biome-ignore lint/suspicious/noExplicitAny: union type has incompatible insert signatures
  await (db as any).insert(accounts).values({
    accountId: email,
    providerId: "credential",
    userId,
    passwordHash: hashed,
    createdAt: now,
    updatedAt: now,
  });

  await recordAdminAction("admin.create_user", userId, adminUserId, {
    email,
    displayName,
  });

  logger.info({ userId, email, adminUserId }, "User created by admin");

  return { id: userId, email, displayName };
}

// ---------------------------------------------------------------------------
// Extended user list for admin
// ---------------------------------------------------------------------------

export interface UserAdminRowExtended {
  id: string;
  email: string;
  displayName: string | null;
  isInstanceAdmin: boolean;
  accountStatus: string;
  createdAt: Date | string;
  activeSessionCount: number;
  activeApiKeyCount: number;
}

export async function listUsersAdminExtended(): Promise<
  UserAdminRowExtended[]
> {
  // 3 queries total (instead of 2N+1) regardless of user count
  const [userRows, sessionCounts, credentialCounts] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isInstanceAdmin: users.isInstanceAdmin,
        accountStatus: users.accountStatus,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.createdAt),
    db
      .select({ userId: sessions.userId, count: count() })
      .from(sessions)
      .groupBy(sessions.userId),
    db
      .select({ ownerUserId: actorCredentials.ownerUserId, count: count() })
      .from(actorCredentials)
      .groupBy(actorCredentials.ownerUserId),
  ]);

  const sessionMap = new Map(sessionCounts.map((r) => [r.userId, r.count]));
  const credentialMap = new Map(
    credentialCounts.map((r) => [r.ownerUserId, r.count]),
  );

  return userRows.map((row) => ({
    ...row,
    activeSessionCount: sessionMap.get(row.id) ?? 0,
    activeApiKeyCount: credentialMap.get(row.id) ?? 0,
  }));
}
