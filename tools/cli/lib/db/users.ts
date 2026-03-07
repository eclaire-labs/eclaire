/**
 * User resolution for CLI commands.
 * Auto-selects the user if there's only one (common for self-hosted).
 */

import inquirer from "inquirer";
import { getDb } from "./index.js";

interface UserRow {
  id: string;
  displayName: string | null;
  email: string;
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
