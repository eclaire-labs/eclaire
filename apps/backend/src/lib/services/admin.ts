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
  // Check if any admin exists
  const existingAdmin = await db.query.users.findFirst({
    where: eq(schema.users.isInstanceAdmin, true),
    columns: { id: true, email: true },
  });

  if (existingAdmin) {
    return;
  }

  // No admin exists — promote the first created user
  const firstUser = await db.query.users.findFirst({
    orderBy: [asc(schema.users.createdAt)],
    columns: { id: true, email: true },
  });

  if (!firstUser) {
    // No users yet — admin will be set when the first user registers
    logger.debug("No users exist yet, admin will be set on first registration");
    return;
  }

  await db
    .update(schema.users)
    .set({ isInstanceAdmin: true })
    .where(eq(schema.users.id, firstUser.id));

  logger.info(
    { userId: firstUser.id, email: firstUser.email },
    "First user set as instance admin",
  );
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
