/**
 * `eclaire settings set <key> <value>` — Set an instance setting.
 */

import { colors, icons } from "../../ui/colors.js";
import {
  setSetting,
  parseSettingValue,
  KNOWN_SETTINGS_KEYS,
} from "../../db/instance-settings.js";
import { closeDb } from "../../db/index.js";

export async function setCommand(key: string, rawValue: string): Promise<void> {
  try {
    if (!(key in KNOWN_SETTINGS_KEYS)) {
      console.error(
        colors.error(`\n  ${icons.error} Unknown setting key "${key}".\n`),
      );
      console.log(colors.dim("  Known keys:"));
      for (const k of Object.keys(KNOWN_SETTINGS_KEYS)) {
        console.log(colors.dim(`    - ${k}`));
      }
      console.log();
      process.exit(1);
    }

    const value = parseSettingValue(key, rawValue);
    await setSetting(key, value);
    await closeDb();

    console.log(
      `\n  ${icons.success} ${colors.emphasis(key)} set to ${formatValue(value)}\n`,
    );
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to set setting: ${error instanceof Error ? error.message : "Unknown error"}\n`,
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
