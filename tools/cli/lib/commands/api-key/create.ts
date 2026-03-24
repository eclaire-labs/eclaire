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
  confirm,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

type DataAccessLevel = "read" | "read_write";
type AdminAccessLevel = "none" | "read" | "read_write";

const DATA_READ_SCOPES = [
  "profile:read",
  "assets:read",
  "tasks:read",
  "channels:read",
  "agents:read",
  "conversations:read",
  "history:read",
  "processing:read",
  "feedback:read",
  "model:read",
  "speech:read",
  "media:read",
];

const DATA_WRITE_SCOPES = [
  "profile:write",
  "assets:write",
  "tasks:write",
  "channels:write",
  "agents:write",
  "conversations:write",
  "feedback:write",
  "notifications:write",
  "processing:write",
  "speech:write",
  "media:write",
];

const ADMIN_SCOPES: Record<AdminAccessLevel, string[]> = {
  none: [],
  read: ["admin:read"],
  read_write: ["admin:read", "admin:write"],
};

function resolvePermissionScopes(
  data: DataAccessLevel,
  admin: AdminAccessLevel,
): string[] {
  const dataScopes =
    data === "read"
      ? DATA_READ_SCOPES
      : [...DATA_READ_SCOPES, ...DATA_WRITE_SCOPES];
  return [...dataScopes, ...ADMIN_SCOPES[admin]];
}

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

    // 4. Permission levels
    const dataAccess = await selectOne<string>({
      message: "Data access",
      options: [
        {
          value: "read",
          label: "Read only",
          hint: "Read all workspace data",
        },
        {
          value: "read_write",
          label: "Read & write",
          hint: "Read and modify all workspace data",
        },
      ],
    });

    const adminAccess = await selectOne<string>({
      message: "Admin access",
      options: [
        { value: "none", label: "None", hint: "No admin access" },
        {
          value: "read",
          label: "Read only",
          hint: "Read admin config",
        },
        {
          value: "read_write",
          label: "Read & write",
          hint: "Full admin access",
        },
      ],
    });

    const scopes = resolvePermissionScopes(
      dataAccess as DataAccessLevel,
      adminAccess as AdminAccessLevel,
    );

    const dataLabel = dataAccess === "read" ? "Read only" : "Read & write";
    const adminLabel =
      adminAccess === "none"
        ? "None"
        : adminAccess === "read"
          ? "Read only"
          : "Read & write";

    // 5. Summary
    const summaryLines = [
      `Actor:        ${actorLabel} (${actorKind})`,
      `Name:         ${name}`,
      `Data access:  ${dataLabel}`,
      `Admin access: ${adminLabel}`,
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
