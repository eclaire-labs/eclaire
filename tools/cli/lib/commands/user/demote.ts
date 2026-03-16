/**
 * Demote a user from instance admin.
 */

import { intro, outro, log, confirm, isCancelled } from "../../ui/clack.js";
import {
  listUsers,
  getUserByEmail,
  setUserAdmin,
  countAdmins,
} from "../../db/users.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";

export async function demoteCommand(email: string): Promise<void> {
  intro(colors.header("Demote user from instance admin"));

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

    if (!user.isInstanceAdmin) {
      log.info(
        `${colors.emphasis(user.email)} is not currently an instance admin.`,
      );
      outro(colors.dim("No changes made."));
      await closeDb();
      return;
    }

    // Safety check: prevent demoting the last admin
    const adminCount = await countAdmins();
    if (adminCount < 2) {
      log.error(
        `Cannot demote the last instance admin. Promote another user first.`,
      );
      outro(colors.error("Aborted."));
      await closeDb();
      process.exit(1);
    }

    const displayName = user.displayName ? ` (${user.displayName})` : "";

    const shouldDemote = await confirm({
      message: `${colors.warning("Warning:")} Remove admin privileges from ${colors.emphasis(user.email)}${displayName}? They will lose access to admin settings.`,
      initialValue: false,
    });

    if (!shouldDemote) {
      outro(colors.dim("Cancelled."));
      await closeDb();
      return;
    }

    await setUserAdmin(user.id, false);
    await closeDb();

    outro(
      `${icons.success} ${colors.success("Done!")} ${colors.emphasis(user.email)} is no longer an instance admin.`,
    );
  } catch (error) {
    if (isCancelled(error)) {
      outro(colors.dim("Cancelled."));
      await closeDb();
      return;
    }
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to demote user: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    await closeDb();
    process.exit(1);
  }
}
