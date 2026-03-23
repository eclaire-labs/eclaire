/**
 * Admin Lifecycle Service
 *
 * Centralizes admin user-management operations: suspend, reactivate,
 * revoke sessions, revoke API keys, and delete user.
 */

import { count, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { recordHistory } from "./history.js";
import { purgeUserData } from "./user-data.js";

const logger = createChildLogger("services:admin-lifecycle");

const { users, sessions, actorCredentials, actorGrants } = schema;

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

  // Set status to suspended
  await db
    .update(users)
    .set({ accountStatus: "suspended", updatedAt: new Date() })
    .where(eq(users.id, targetUserId));

  // Revoke all sessions immediately
  await db.delete(sessions).where(eq(sessions.userId, targetUserId));

  // Deactivate all API credentials
  await db
    .update(actorCredentials)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(actorCredentials.ownerUserId, targetUserId));

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

  // 1. Revoke all sessions and deactivate API credentials
  await db.delete(sessions).where(eq(sessions.userId, targetUserId));
  await db
    .delete(actorCredentials)
    .where(eq(actorCredentials.ownerUserId, targetUserId));
  await db.delete(actorGrants).where(eq(actorGrants.ownerUserId, targetUserId));

  // 2. Purge all user-owned data (assets, history, preferences, storage)
  //    Reuses the same path as self-service delete — handles tags, queue jobs,
  //    storage files, etc.
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

  // 4. Delete the user account itself
  await db.delete(users).where(eq(users.id, targetUserId));

  logger.info(
    { targetUserId, adminUserId, email: target.email },
    "User account deleted by admin",
  );
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
  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      isInstanceAdmin: users.isInstanceAdmin,
      accountStatus: users.accountStatus,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt);

  // Batch-fetch session and credential counts
  const results: UserAdminRowExtended[] = [];
  for (const row of userRows) {
    const [sessionResult, credentialResult] = await Promise.all([
      db
        .select({ count: count() })
        .from(sessions)
        .where(eq(sessions.userId, row.id)),
      db
        .select({ count: count() })
        .from(actorCredentials)
        .where(eq(actorCredentials.ownerUserId, row.id)),
    ]);

    results.push({
      ...row,
      activeSessionCount: sessionResult[0]?.count ?? 0,
      activeApiKeyCount: credentialResult[0]?.count ?? 0,
    });
  }

  return results;
}
