/**
 * Admin Service
 *
 * Manages instance admin state. The first registered user is automatically
 * set as the instance admin if no admin exists.
 */

import { asc, count, eq } from "drizzle-orm";
import { db, schema, txManager } from "../../db/index.js";
import { ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { recordHistory } from "./history.js";

const logger = createChildLogger("services:admin");

/**
 * Ensure at least one instance admin exists.
 * If no user has isInstanceAdmin = true, sets it on the first created user.
 * Called during application startup.
 */
export async function ensureInstanceAdmin(): Promise<void> {
  const promoted = await txManager.withTransaction(async (tx) => {
    // Check if any admin exists (inside transaction to prevent races)
    const existingAdmin = await tx.users.findFirst(
      eq(schema.users.isInstanceAdmin, true),
    );

    if (existingAdmin) {
      return null;
    }

    // No admin exists — promote the first created user.
    // tx.users.findFirst doesn't support orderBy, so fetch all and sort in app
    // (only runs at startup with typically 0-5 users).
    const allUsers = await tx.users.findMany(undefined);
    if (allUsers.length === 0) {
      return null;
    }

    const firstUser = allUsers.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )[0]!;

    await tx.users.update(eq(schema.users.id, firstUser.id), {
      isInstanceAdmin: true,
    });

    return { id: firstUser.id, email: firstUser.email };
  });

  if (promoted) {
    logger.info(
      { userId: promoted.id, email: promoted.email },
      "First user set as instance admin",
    );
  } else {
    logger.debug("No admin promotion needed (admin exists or no users yet)");
  }
}

// =============================================================================
// User Management
// =============================================================================

export interface UserAdminRow {
  id: string;
  email: string;
  displayName: string | null;
  isInstanceAdmin: boolean;
  createdAt: Date | string;
}

/**
 * List all users with admin-relevant fields.
 */
export async function listUsersAdmin(): Promise<UserAdminRow[]> {
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      isInstanceAdmin: schema.users.isInstanceAdmin,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.createdAt));
  return rows as UserAdminRow[];
}

/**
 * Count the number of instance admins.
 */
export async function countAdmins(): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(schema.users)
    .where(eq(schema.users.isInstanceAdmin, true));
  return result[0]?.count ?? 0;
}

/**
 * Update a user's admin role.
 * Prevents demoting the last admin. Uses a transaction to prevent
 * concurrent demotion requests from leaving zero admins.
 */
export async function setUserRole(
  userId: string,
  isAdmin: boolean,
  adminUserId?: string,
): Promise<void> {
  await txManager.withTransaction(async (tx) => {
    if (!isAdmin) {
      // Count admins inside the transaction to prevent race conditions
      const admins = await tx.users.findMany(
        eq(schema.users.isInstanceAdmin, true),
      );
      if (admins.length <= 1) {
        const target = admins.find((a) => a.id === userId);
        if (target) {
          throw new ValidationError("Cannot demote the last instance admin");
        }
      }
    }

    await tx.users.update(eq(schema.users.id, userId), {
      isInstanceAdmin: isAdmin,
      updatedAt: new Date(),
    });
  });

  // Record history outside the transaction (non-critical side effect)
  if (adminUserId) {
    await recordHistory({
      action: "admin.role_change",
      itemType: "user_account",
      itemId: userId,
      actor: "human",
      actorId: adminUserId,
      userId,
      metadata: { isAdmin },
    });
  }

  logger.info({ userId, isAdmin }, "User role updated");
}
