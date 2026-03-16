/**
 * `eclaire settings list` — List all instance settings.
 */

import { colors, icons } from "../../ui/colors.js";
import { createSettingsTable } from "../../ui/format.js";
import {
  getAllSettings,
  KNOWN_SETTINGS_KEYS,
} from "../../db/instance-settings.js";
import { closeDb } from "../../db/index.js";

export async function listCommand(options: { json?: boolean }): Promise<void> {
  try {
    console.log(colors.header(`\n  ${icons.gear} Instance Settings\n`));

    const settings = await getAllSettings();
    await closeDb();

    if (options.json) {
      console.log(JSON.stringify(settings, null, 2));
      return;
    }

    console.log(createSettingsTable(settings, KNOWN_SETTINGS_KEYS));

    console.log(colors.dim("\nCommands:"));
    console.log(
      colors.dim("  eclaire settings get <key>          - Get a setting"),
    );
    console.log(
      colors.dim("  eclaire settings set <key> <value>  - Set a setting"),
    );
    console.log();
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to list settings: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}
