/**
 * User resolution and admin management for CLI commands.
 * Auto-selects the user if there's only one (common for self-hosted).
 */

import { count, eq, sql } from "drizzle-orm";
import inquirer from "inquirer";
import { getDb } from "./index.js";

interface UserRow {
  id: string;
  displayName: string | null;
  email: string;
}

export interface UserAdminRow {
  id: string;
  email: string;
  displayName: string | null;
  isInstanceAdmin: boolean;
  createdAt: Date | number;
}

export async function getDefaultUser(): Promise<UserRow> {
  const { db, schema } = getDb();
  // biome-ignore lint/suspicious/noExplicitAny: DbInstance is a union type
  const d = db as any;
  const users: UserRow[] = await d
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      email: schema.users.email,
    })
    .from(schema.users);

  if (users.length === 0) {
    throw new Error(
      "No users found in the database. Please create a user first via the web UI.",
    );
  }

  if (users.length === 1) {
    return users[0] as UserRow;
  }

  // Multiple users — prompt for selection
  const { selected } = await inquirer.prompt([
    {
      type: "select",
      name: "selected",
      message: "Select user:",
      choices: users.map((u) => ({
        name: `${u.displayName || u.email} (${u.id})`,
        value: u,
      })),
    },
  ]);

  return selected;
}

// biome-ignore lint/suspicious/noExplicitAny: DbInstance is a union type
function query(): { db: any; users: any } {
  const { db, schema } = getDb();
  return { db, users: schema.users };
}

export async function listUsers(): Promise<UserAdminRow[]> {
  const { db, users } = query();
  return db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      isInstanceAdmin: users.isInstanceAdmin,
      createdAt: users.createdAt,
    })
    .from(users);
}

export async function getUserByEmail(
  email: string,
): Promise<UserAdminRow | undefined> {
  const { db, users } = query();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      isInstanceAdmin: users.isInstanceAdmin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);
  return rows[0];
}

export async function setUserAdmin(
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  const { db, users } = query();
  await db
    .update(users)
    .set({ isInstanceAdmin: isAdmin, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function countAdmins(): Promise<number> {
  const { db, users } = query();
  const result = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.isInstanceAdmin, true));
  return result[0]?.count ?? 0;
}
