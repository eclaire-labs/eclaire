/**
 * `eclaire settings get <key>` — Get a single instance setting.
 */

import { colors, icons } from "../../ui/colors.js";
import { getSetting, KNOWN_SETTINGS_KEYS } from "../../db/instance-settings.js";
import { closeDb } from "../../db/index.js";

export async function getCommand(key: string): Promise<void> {
  try {
    if (!(key in KNOWN_SETTINGS_KEYS)) {
      console.log(
        colors.warning(
          `\n  ${icons.warning} "${key}" is not a recognized setting key. Attempting to fetch anyway.\n`,
        ),
      );
    }

    const value = await getSetting(key);
    await closeDb();

    if (value === undefined) {
      console.log(
        colors.dim(`\n  ${icons.info} Setting "${key}" is not set.\n`),
      );
      return;
    }

    console.log(`\n  ${colors.emphasis(key)} = ${formatValue(value)}\n`);
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to get setting: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? colors.success("true") : colors.error("false");
  }
  return String(value);
}
