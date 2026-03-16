/**
 * Promote a user to instance admin.
 */

import { intro, outro, log, confirm, isCancelled } from "../../ui/clack.js";
import { listUsers, getUserByEmail, setUserAdmin } from "../../db/users.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";

export async function promoteCommand(email: string): Promise<void> {
  intro(colors.header("Promote user to instance admin"));

  try {
    const user = await getUserByEmail(email);

    if (!user) {
      const allUsers = await listUsers();
      const emails = allUsers.map((u) => u.email).join(", ");
      log.error(
        `User not found: ${colors.emphasis(email)}\n` +
          `  Available users: ${emails || colors.dim("none")}`,
      );
      await closeDb();
      process.exit(1);
    }

    if (user.isInstanceAdmin) {
      log.info(`${colors.emphasis(user.email)} is already an instance admin.`);
      outro(colors.dim("No changes made."));
      await closeDb();
      return;
    }

    const displayName = user.displayName ? ` (${user.displayName})` : "";

    const shouldPromote = await confirm({
      message: `Promote ${colors.emphasis(user.email)}${displayName} to instance admin?`,
    });

    if (!shouldPromote) {
      outro(colors.dim("Cancelled."));
      await closeDb();
      return;
    }

    await setUserAdmin(user.id, true);
    await closeDb();

    outro(
      `${icons.success} ${colors.success("Done!")} ${colors.emphasis(user.email)} is now an instance admin.`,
    );
  } catch (error) {
    if (isCancelled(error)) {
      outro(colors.dim("Cancelled."));
      await closeDb();
      return;
    }
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to promote user: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    await closeDb();
    process.exit(1);
  }
}
