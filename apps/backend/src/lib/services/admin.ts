/**
 * Admin Service
 *
 * Manages instance admin state. The first registered user is automatically
 * set as the instance admin if no admin exists.
 */

import { asc, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { createChildLogger } from "../logger.js";

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
