import { getMcpServer, updateMcpServer } from "../../db/mcp-servers.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";
import { createMcpServerInfoTable } from "../../ui/format.js";
import {
  intro,
  outro,
  cancel,
  textInput,
  selectOne,
  selectMany,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

export async function editCommand(id: string): Promise<void> {
  try {
    const server = await getMcpServer(id);
    if (!server) {
      console.error(
        colors.error(`\n  ${icons.error} MCP server not found: ${id}\n`),
      );
      await closeDb();
      process.exit(1);
    }

    intro(`${icons.gear} Edit MCP Server: ${server.name}`);

    // Show current config
    console.log(createMcpServerInfoTable(server));
    console.log();

    // Select fields to edit
    const fieldsToEdit = await selectMany<string>({
      message: "Select fields to edit",
      options: [
        { value: "name", label: "Name", hint: server.name },
        {
          value: "description",
          label: "Description",
          hint: server.description || "(none)",
        },
        {
          value: "transport",
          label: "Transport",
          hint: server.transport,
        },
        {
          value: "command",
          label: server.transport === "stdio" ? "Command & Args" : "URL",
          hint: server.command || "(none)",
        },
        {
          value: "connectTimeout",
          label: "Connect Timeout",
          hint: server.connectTimeout ? `${server.connectTimeout}ms` : "(none)",
        },
        {
          value: "toolMode",
          label: "Tool Mode",
          hint: server.toolMode || "managed",
        },
      ],
    });

    if (fieldsToEdit.length === 0) {
      cancel("No fields selected");
      await closeDb();
      return;
    }

    const updates: Record<string, unknown> = {};

    for (const field of fieldsToEdit) {
      if (field === "name") {
        const name = await textInput({
          message: "New name",
          defaultValue: server.name,
          validate: (value: string) => {
            if (!value || value.trim().length === 0) {
              return "Name is required";
            }
          },
        });
        updates.name = name;
      }

      if (field === "description") {
        const description = await textInput({
          message: "New description (leave empty to clear)",
          defaultValue: server.description || "",
        });
        updates.description = description || null;
      }

      if (field === "transport") {
        const transport = await selectOne<string>({
          message: "New transport type",
          options: [
            {
              value: "stdio",
              label: "stdio",
              hint: "Local process via stdin/stdout",
            },
            {
              value: "sse",
              label: "sse",
              hint: "Server-Sent Events over HTTP",
            },
            {
              value: "http",
              label: "http",
              hint: "Streamable HTTP",
            },
          ],
        });
        updates.transport = transport;
      }

      if (field === "command") {
        // Determine effective transport (use updated if changed, otherwise current)
        const effectiveTransport =
          (updates.transport as string) || server.transport;

        if (effectiveTransport === "stdio") {
          const command = await textInput({
            message: "Command to run",
            defaultValue: server.command || "",
            validate: (value: string) => {
              if (!value || value.trim().length === 0) {
                return "Command is required for stdio transport";
              }
            },
          });
          updates.command = command;

          const argsRaw = await textInput({
            message: "Arguments (space-separated)",
            defaultValue: server.args?.join(" ") || "",
          });
          updates.args =
            argsRaw.trim().length > 0 ? argsRaw.trim().split(/\s+/) : null;
        } else {
          const url = await textInput({
            message: "Server URL",
            defaultValue: server.command || "",
            validate: (value: string) => {
              if (!value || value.trim().length === 0) {
                return "URL is required for this transport";
              }
              try {
                new URL(value);
              } catch {
                return "Must be a valid URL";
              }
            },
          });
          updates.command = url;
          updates.args = null;
        }
      }

      if (field === "connectTimeout") {
        const timeoutRaw = await textInput({
          message: "Connect timeout in ms (leave empty to clear)",
          defaultValue: server.connectTimeout
            ? String(server.connectTimeout)
            : "",
        });
        if (timeoutRaw.trim().length > 0) {
          const parsed = Number.parseInt(timeoutRaw, 10);
          if (Number.isNaN(parsed)) {
            cancel("Timeout must be a number");
            await closeDb();
            process.exit(1);
          }
          updates.connectTimeout = parsed;
        } else {
          updates.connectTimeout = null;
        }
      }

      if (field === "toolMode") {
        const toolMode = await selectOne<string>({
          message: "New tool mode",
          options: [
            {
              value: "managed",
              label: "managed",
              hint: "Eclaire manages which tools are exposed",
            },
            {
              value: "auto",
              label: "auto",
              hint: "All tools available automatically",
            },
          ],
        });
        updates.toolMode = toolMode;
      }
    }

    if (Object.keys(updates).length === 0) {
      cancel("No changes made");
      await closeDb();
      return;
    }

    await updateMcpServer(id, updates as Parameters<typeof updateMcpServer>[1]);
    await closeDb();

    outro(
      colors.success(
        `${icons.success} MCP server "${id}" updated successfully!`,
      ),
    );
  } catch (error: unknown) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to edit MCP server: ${message}\n`,
      ),
    );
    await closeDb();
    process.exit(1);
  }
}
