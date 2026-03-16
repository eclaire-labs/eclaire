/**
 * Revoke an API key by credential ID.
 */

import { listApiKeys, revokeApiKey } from "../../db/api-keys.js";
import { getDefaultUser } from "../../db/users.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";
import {
  cancel,
  confirm,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

export async function revokeCommand(
  id: string,
  options: { force?: boolean },
): Promise<void> {
  try {
    const user = await getDefaultUser();
    const keys = await listApiKeys(user.id);
    const key = keys.find((k) => k.id === id);

    if (!key) {
      console.error(
        colors.error(`\n  ${icons.error} API key not found: ${id}\n`),
      );
      await closeDb();
      process.exit(1);
    }

    // Show key info
    console.log(colors.header(`\n  ${icons.gear} API Key: ${key.name}\n`));
    console.log(`  Key:     ${colors.dim(key.displayKey)}`);
    console.log(`  Name:    ${key.name}`);
    console.log(
      `  Scopes:  ${key.scopes.includes("*") ? colors.warning("full access") : colors.dim(key.scopes.join(", "))}`,
    );
    console.log(
      `  Status:  ${key.isActive ? colors.success("active") : colors.error("revoked")}`,
    );
    console.log();

    if (!key.isActive) {
      console.log(
        colors.warning(`  ${icons.warning} This key is already revoked.\n`),
      );
      await closeDb();
      return;
    }

    if (!options.force) {
      const confirmed = await confirm({
        message: "This will permanently revoke this API key. Continue?",
        initialValue: false,
      });

      if (!confirmed) {
        cancel("Cancelled");
        await closeDb();
        return;
      }
    }

    const revoked = await revokeApiKey(id, user.id);
    await closeDb();

    if (revoked) {
      console.log(
        colors.success(`\n  ${icons.success} API key revoked: ${key.name}\n`),
      );
    } else {
      console.error(
        colors.error(`\n  ${icons.error} Failed to revoke API key\n`),
      );
      process.exit(1);
    }
  } catch (error: unknown) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      colors.error(`\n  ${icons.error} Failed to revoke API key: ${message}\n`),
    );
    await closeDb();
    process.exit(1);
  }
}
