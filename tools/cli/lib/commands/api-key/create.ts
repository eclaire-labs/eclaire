/**
 * Interactively create a new API key using @clack/prompts.
 */

import chalk from "chalk";
import { createApiKey } from "../../db/api-keys.js";
import { listActors, getOrCreateHumanActor } from "../../db/actors.js";
import { getDefaultUser } from "../../db/users.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";
import {
  intro,
  outro,
  cancel,
  note,
  log,
  textInput,
  selectOne,
  selectMany,
  confirm,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

export async function createCommand(): Promise<void> {
  try {
    intro("Create API Key");

    // 1. Resolve user
    const user = await getDefaultUser();

    // 2. Resolve actor
    let actors = await listActors(user.id);
    if (actors.length === 0) {
      log.step("No actors found — creating default human actor...");
      const humanActor = await getOrCreateHumanActor(user.id);
      actors = [humanActor];
    }

    let actorId: string;
    let actorKind: string;
    let actorLabel: string;

    if (actors.length === 1) {
      const actor = actors[0] as (typeof actors)[0];
      actorId = actor.id;
      actorKind = actor.kind;
      actorLabel = actor.displayName || actor.kind;
      log.step(`Using actor: ${colors.emphasis(actorLabel)} (${actor.kind})`);
    } else {
      actorId = await selectOne<string>({
        message: "Select actor",
        options: actors.map((a) => ({
          value: a.id,
          label: a.displayName || a.id,
          hint: a.kind,
        })),
      });
      const selected = actors.find((a) => a.id === actorId);
      actorKind = selected?.kind ?? "unknown";
      actorLabel = selected?.displayName || selected?.kind || actorId;
    }

    // 3. Key name
    const name = await textInput({
      message: "Key name",
      defaultValue: `API Key ${new Date().toISOString().split("T")[0]}`,
      placeholder: "My API Key",
    });

    // 4. Scopes
    const scopeOptions = [
      { value: "*", label: "Full access", hint: "All permissions" },
      {
        value: "assets:read",
        label: "Read assets",
        hint: "Bookmarks, documents, photos",
      },
      {
        value: "assets:write",
        label: "Write assets",
        hint: "Create/update/delete assets",
      },
      { value: "tasks:read", label: "Read tasks" },
      { value: "tasks:write", label: "Write tasks" },
      { value: "conversations:read", label: "Read conversations" },
      {
        value: "conversations:write",
        label: "Write conversations",
        hint: "Send messages",
      },
      { value: "agents:read", label: "Read agents" },
      { value: "agents:write", label: "Write agents" },
      { value: "channels:read", label: "Read channels" },
      { value: "channels:write", label: "Write channels" },
      { value: "profile:read", label: "Read profile" },
      { value: "profile:write", label: "Write profile" },
    ];

    const scopes = await selectMany<string>({
      message: "Select scopes",
      options: scopeOptions,
      required: true,
    });

    // 5. Summary
    const summaryLines = [
      `Actor:   ${actorLabel} (${actorKind})`,
      `Name:    ${name}`,
      `Scopes:  ${scopes.includes("*") ? "Full access (*)" : scopes.join(", ")}`,
    ].join("\n");

    note(summaryLines, "New API Key");

    // 6. Confirm
    const proceed = await confirm({
      message: "Create this API key?",
      initialValue: true,
    });

    if (!proceed) {
      cancel("Cancelled");
      await closeDb();
      return;
    }

    // 7. Generate key
    const result = await createApiKey({
      ownerUserId: user.id,
      actorId,
      actorKind,
      name,
      scopes,
    });
    await closeDb();

    // 8. Display the full key prominently
    note(
      `${chalk.bold(result.fullKey)}\n\n${chalk.yellow("Save this key now — it will not be shown again.")}`,
      "Your API Key",
    );

    outro(colors.success(`${icons.success} API key created successfully!`));
  } catch (error: unknown) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      colors.error(`\n  ${icons.error} Failed to create API key: ${message}\n`),
    );
    await closeDb();
    process.exit(1);
  }
}
