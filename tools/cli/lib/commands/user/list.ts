/**
 * List all users with admin status highlighted.
 */

import { listUsers } from "../../db/users.js";
import { closeDb } from "../../db/index.js";
import { createUsersTable } from "../../ui/format.js";
import { colors, icons } from "../../ui/colors.js";

export async function listCommand(options: { json?: boolean }): Promise<void> {
  try {
    const users = await listUsers();

    if (options.json) {
      console.log(JSON.stringify(users, null, 2));
      await closeDb();
      return;
    }

    if (users.length === 0) {
      console.log(
        colors.warning(
          `\n  ${icons.info} No users found. Users are created when they sign in via the web UI.\n`,
        ),
      );
      await closeDb();
      return;
    }

    console.log(colors.header(`\n  ${icons.robot} Users (${users.length})\n`));
    console.log(createUsersTable(users));
    await closeDb();
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to list users: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}
