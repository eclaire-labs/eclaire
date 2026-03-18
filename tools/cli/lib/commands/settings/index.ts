/**
 * Settings subcommand registration
 */

import { Command } from "commander";
import { listCommand } from "./list.js";
import { getCommand } from "./get.js";
import { setCommand } from "./set.js";
import { closeDb } from "../../db/index.js";
import {
  getAllSettings,
  setSetting,
  KNOWN_SETTINGS_KEYS,
} from "../../db/instance-settings.js";
import { discoverAudioModels } from "../../db/audio.js";
import {
  intro,
  outro,
  cancel,
  selectOne,
  textInput,
  confirm,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

const AUDIO_MODEL_KEYS = new Set([
  "audio.defaultSttModel",
  "audio.defaultTtsModel",
]);

async function interactiveSettings(): Promise<void> {
  try {
    intro("Instance Settings");

    const currentSettings = await getAllSettings();

    // Build options from known keys, showing current values as hints
    const options = Object.entries(KNOWN_SETTINGS_KEYS).map(([key, type]) => {
      const current = currentSettings[key];
      const hint =
        current !== undefined
          ? `${String(current)} (${type})`
          : `not set (${type})`;
      return { value: key, label: key, hint };
    });

    const selectedKey = await selectOne<string>({
      message: "Select a setting to update",
      options,
    });

    const settingType = KNOWN_SETTINGS_KEYS[selectedKey];
    const currentValue = currentSettings[selectedKey];
    let newValue: unknown;

    if (settingType === "boolean") {
      newValue = await confirm({
        message: `${selectedKey}`,
        initialValue: currentValue === true,
      });
    } else if (AUDIO_MODEL_KEYS.has(selectedKey)) {
      const models = await discoverAudioModels();
      if (models && models.length > 0) {
        newValue = await selectOne<string>({
          message: `${selectedKey}`,
          options: models.map((m) => ({
            value: m,
            label: m,
            hint: m === currentValue ? "(current)" : undefined,
          })),
        });
      } else {
        newValue = await textInput({
          message: `${selectedKey} (audio server not reachable — enter model ID manually)`,
          defaultValue: typeof currentValue === "string" ? currentValue : "",
        });
      }
    } else {
      newValue = await textInput({
        message: `${selectedKey}`,
        defaultValue: typeof currentValue === "string" ? currentValue : "",
      });
    }

    await setSetting(selectedKey, newValue);
    await closeDb();

    outro("Setting updated");
  } catch (error: unknown) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    throw error;
  }
}

export function registerSettingsCommands(program: Command): void {
  const settings = new Command("settings")
    .description("Manage instance settings")
    .action(async () => {
      await interactiveSettings();
    });

  settings
    .command("list")
    .description("List all instance settings")
    .option("--json", "Output as JSON")
    .action(listCommand);

  settings
    .command("get")
    .description("Get an instance setting")
    .argument("<key>", "Setting key")
    .action(getCommand);

  settings
    .command("set")
    .description("Set an instance setting")
    .argument("<key>", "Setting key")
    .argument("<value>", "Setting value")
    .action(setCommand);

  program.addCommand(settings);
}
