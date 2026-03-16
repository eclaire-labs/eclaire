/**
 * List all API keys for the current user.
 */

import { listApiKeys } from "../../db/api-keys.js";
import { getDefaultUser } from "../../db/users.js";
import { closeDb } from "../../db/index.js";
import { createApiKeysTable } from "../../ui/format.js";
import { colors, icons } from "../../ui/colors.js";

export async function listCommand(options: { json?: boolean }): Promise<void> {
  try {
    const user = await getDefaultUser();
    const keys = await listApiKeys(user.id);

    if (options.json) {
      console.log(JSON.stringify(keys, null, 2));
      await closeDb();
      return;
    }

    if (keys.length === 0) {
      console.log(
        colors.warning(
          `\n  ${icons.info} No API keys found. Use ${colors.emphasis("eclaire api-key create")} to create one.\n`,
        ),
      );
      await closeDb();
      return;
    }

    console.log(colors.header(`\n  ${icons.gear} API Keys (${keys.length})\n`));
    console.log(createApiKeysTable(keys));
    console.log();
    console.log(
      colors.dim(
        `  Manage keys: ${colors.emphasis("eclaire api-key create")} | ${colors.emphasis("eclaire api-key revoke <id>")}`,
      ),
    );
    console.log();
    await closeDb();
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to list API keys: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    await closeDb();
    process.exit(1);
  }
}
